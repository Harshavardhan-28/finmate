import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import type { AuthUser, Dashboard, Expense, FamilyMember, Proposal, SavedExpense, Status, StreamEvent } from "./types";

function guessBase() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, "");
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (host) return `http://${host}:8000`;
  return Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://localhost:8000";
}
export const API = guessBase();

const KEY = "finmate_token";
let token: string | null = null;
export const loadToken = async () => (token = await SecureStore.getItemAsync(KEY).catch(() => null));
export const setToken = async (t: string | null) => {
  token = t;
  if (t) await SecureStore.setItemAsync(KEY, t);
  else await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
};
export const hasToken = () => !!token;

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : `Request failed (${res.status})`);
  }
  return res.json();
}
const call = (path: string, init: RequestInit = {}) =>
  fetch(`${API}${path}`, { ...init, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers as object) } });
const send = <T,>(method: string, path: string, body?: unknown) =>
  call(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(json<T>);

export async function login(email: string, password: string) {
  const r = await send<{ user: AuthUser; token: string }>("POST", "/api/auth/login", { email, password });
  await setToken(r.token);
  return r.user;
}
export async function register(name: string, email: string, password: string) {
  const r = await send<{ user: AuthUser; token: string }>("POST", "/api/auth/register", { name, email, password });
  await setToken(r.token);
  return r.user;
}
export const getAuthConfig = () => send<{ google: boolean }>("GET", "/api/auth/config");

/** Google sign-in runs in the system browser against the backend; the backend hands a Bearer token back to our deep link. */
export async function googleSignIn() {
  const back = Linking.createURL("auth");
  const base = (process.env.EXPO_PUBLIC_AUTH_URL || API).replace(/\/$/, "");
  const url = `${base}/api/auth/google/login?client=mobile&return_to=${encodeURIComponent(back)}`;
  // Prefer Chrome on Android: it is usually signed in to the user's Google account, unlike Samsung Internet.
  let browserPackage: string | undefined;
  if (Platform.OS === "android") {
    const { browserPackages } = await WebBrowser.getCustomTabsSupportingBrowsersAsync().catch(() => ({ browserPackages: [] as string[] }));
    browserPackage = browserPackages.find((p) => p === "com.android.chrome");
  }
  const res = await WebBrowser.openAuthSessionAsync(url, back, browserPackage ? { browserPackage } : undefined);
  if (res.type !== "success") return null;
  const q = Linking.parse(res.url).queryParams ?? {};
  if (typeof q.token !== "string") throw new Error("Google sign-in didn’t complete. Try again.");
  await setToken(q.token);
  return getMe();
}
export const getMe = () => send<{ user: AuthUser }>("GET", "/api/auth/me").then((r) => r.user);
export const logout = async () => { await send("POST", "/api/auth/logout").catch(() => undefined); await setToken(null); };

export const getDashboard = () => send<Dashboard>("GET", "/api/dashboard");
export const getExpenses = (days = 90) => send<Expense[]>("GET", `/api/expenses?days=${days}`);
export const addExpense = (e: { amount: number; date: string; merchant: string; category: string; note: string }) =>
  send<SavedExpense>("POST", "/api/expenses", e);
export const deleteExpense = (id: number) => send<{ ok: boolean }>("DELETE", `/api/expenses/${id}`);
export const putBudget = (owner_type: "user" | "family", category: string, monthly_limit: number) =>
  send<Status>("PUT", "/api/budgets", { owner_type, category, monthly_limit });
export const listMembers = () => send<FamilyMember[]>("GET", "/api/family/members");
export const addMember = (m: { name: string; email: string; password: string; role: string }) =>
  send<FamilyMember[]>("POST", "/api/family/members", m);
export const updatePreferences = (currency: string, warn_pct: number) =>
  send<{ user: AuthUser }>("PATCH", "/api/account/preferences", { currency, warn_pct }).then((r) => r.user);
export const changePassword = (current_password: string, new_password: string) =>
  send<{ ok: boolean }>("POST", "/api/account/password", { current_password, new_password });
export const signOutEverywhere = () => send<{ ok: boolean }>("POST", "/api/account/sign-out-everywhere");
export const deleteAccount = (confirm_email: string, password: string) =>
  send<{ ok: boolean }>("DELETE", "/api/account", { confirm_email, password });
export const exportCsv = () =>
  call("/api/account/export").then((r) => (r.ok ? r.text() : Promise.reject(new Error(`Export failed (${r.status})`))));

/** Multipart upload through XMLHttpRequest: Expo's fetch rejects React Native's `{ uri, name, type }` file parts. */
export function upload(uri: string, filename: string, mime: string, kind: "receipt" | "voice") {
  return new Promise<{ attachment_id: string }>((resolve, reject) => {
    const form = new FormData();
    form.append("file", { uri, name: filename, type: mime } as unknown as Blob);
    form.append("kind", kind);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API}/api/upload`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.onload = () => {
      let body: { attachment_id?: string; detail?: unknown } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* non-JSON error body */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.attachment_id) resolve({ attachment_id: body.attachment_id });
      else reject(new Error(typeof body.detail === "string" ? body.detail : `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Couldn’t reach the server. Check the connection and try again."));
    xhr.ontimeout = () => reject(new Error("The upload timed out."));
    xhr.timeout = 60000;
    xhr.send(form);
  });
}

/** POST to an SSE endpoint and call onEvent for every `data:` frame as it arrives. */
export async function streamPost(path: string, body: unknown, onEvent: (e: StreamEvent) => void) {
  const res = await call(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail ?? `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (line) onEvent(JSON.parse(line.slice(6)) as StreamEvent);
    }
  }
}
export type { Proposal };

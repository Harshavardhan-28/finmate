import type {
  AuthUser, Dashboard, Expense, FamilyMember, SavedBill, SavedExpense, Status, SttStatus, StreamEvent,
} from "./types";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Request failed (${res.status})`);
  }
  return res.json();
}

/** ngrok's free plan answers browser requests with an HTML warning page that has no CORS headers, so every fetch to an
 *  ngrok address fails. This header makes ngrok pass the request through. It is only sent to ngrok addresses. */
const NGROK_HEADERS: Record<string, string> = /ngrok/i.test(API) ? { "ngrok-skip-browser-warning": "1" } : {};

/** Every call sends the httpOnly session cookie; a 401 means the session is gone. */
const call = (path: string, init: RequestInit = {}) =>
  fetch(`${API}${path}`, {
    credentials: "include",
    ...init,
    headers: { ...NGROK_HEADERS, ...(init.headers as Record<string, string> | undefined) },
  });
const post = (path: string, body?: unknown) =>
  call(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const getMe = () => call("/api/auth/me").then(json<{ user: AuthUser }>).then((r) => r.user);
export const getAuthConfig = () => call("/api/auth/config").then(json<{ google: boolean }>);
export const login = (email: string, password: string) =>
  post("/api/auth/login", { email, password }).then(json<{ user: AuthUser }>).then((r) => r.user);
export const register = (name: string, email: string, password: string) =>
  post("/api/auth/register", { name, email, password }).then(json<{ user: AuthUser }>).then((r) => r.user);
export const logout = () => post("/api/auth/logout").then(json);
const send = <T,>(method: string, path: string, body?: unknown) =>
  call(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(json<T>);

export const updateProfile = (name: string, email: string) =>
  send<{ user: AuthUser }>("PATCH", "/api/account/profile", { name, email }).then((r) => r.user);
export const changePassword = (current_password: string, new_password: string) =>
  send<{ ok: boolean }>("POST", "/api/account/password", { current_password, new_password });
export const signOutEverywhere = () => send<{ ok: boolean }>("POST", "/api/account/sign-out-everywhere");
export const updatePreferences = (currency: string, warn_pct: number) =>
  send<{ user: AuthUser }>("PATCH", "/api/account/preferences", { currency, warn_pct }).then((r) => r.user);
export const deleteAccount = (confirm_email: string, password: string) =>
  send<{ ok: boolean }>("DELETE", "/api/account", { confirm_email, password });
export async function downloadExport() {
  const res = await call("/api/account/export");
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "finmate-expenses.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export const listMembers = () => send<FamilyMember[]>("GET", "/api/family/members");
export const addMember = (m: { name: string; email: string; password: string; role: string }) =>
  send<FamilyMember[]>("POST", "/api/family/members", m);
export const setMemberRole = (id: string, role: string) =>
  send<FamilyMember[]>("PATCH", `/api/family/members/${id}`, { role });
export const removeMember = (id: string) => send<FamilyMember[]>("DELETE", `/api/family/members/${id}`);

export const addExpense = (e: { amount: number; date: string; merchant: string; category: string; note: string }) =>
  send<SavedExpense>("POST", "/api/expenses", e);
export const addBill = (b: { merchant: string; date: string; items: { name: string; amount: number; category: string }[] }) =>
  send<SavedBill>("POST", "/api/bills", b);
export const deleteBill = (id: number) => send<{ ok: boolean }>("DELETE", `/api/bills/${id}`);
export const deleteExpense = (id: number) => send<{ ok: boolean }>("DELETE", `/api/expenses/${id}`);
export const putBudget = (owner_type: "user" | "family", category: string, monthly_limit: number) =>
  send<Status>("PUT", "/api/budgets", { owner_type, category, monthly_limit });
export const deleteBudget = (owner_type: "user" | "family", category: string) =>
  send<Status>("DELETE", `/api/budgets/${owner_type}/${encodeURIComponent(category)}`);

export const googleLoginUrl = `${API}/api/auth/google/login`;

export const getExpenses = (days = 90) => call(`/api/expenses?days=${days}`).then(json<Expense[]>);
export const getDashboard = () => call("/api/dashboard").then(json<Dashboard>);
export const getHealth = () =>
  call("/api/health").then(json<{ ok: boolean; llm_configured: boolean; model: string; stt?: SttStatus }>);
export const resetDemo = () => post("/api/reset").then(json);

export async function upload(file: Blob, filename: string, kind: "receipt" | "voice") {
  const form = new FormData();
  form.append("file", file, filename);
  form.append("kind", kind);
  return call("/api/upload", { method: "POST", body: form }).then(json<{ attachment_id: string }>);
}

/** Turn a spoken recording into text. The server does not keep the audio. */
export async function speechToText(audio: Blob, filename = "voice.wav", language = "") {
  const form = new FormData();
  form.append("file", audio, filename);
  if (language) form.append("language", language);
  return call("/api/stt", { method: "POST", body: form }).then(json<{ text: string; provider: string }>);
}

/** POST to an SSE endpoint and call onEvent for every `data:` frame as it arrives. */
export async function streamPost(path: string, body: unknown, onEvent: (e: StreamEvent) => void) {
  const res = await post(path, body);
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

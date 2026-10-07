import type { Dashboard, StreamEvent, User } from "./types";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export const getUsers = () => fetch(`${API}/api/users`).then(json<User[]>);
export const getDashboard = (userId: string) =>
  fetch(`${API}/api/dashboard?user_id=${encodeURIComponent(userId)}`).then(json<Dashboard>);
export const getHealth = () =>
  fetch(`${API}/api/health`).then(json<{ ok: boolean; llm_configured: boolean; model: string }>);
export const resetDemo = () => fetch(`${API}/api/reset`, { method: "POST" }).then(json);

export async function upload(file: Blob, filename: string, kind: "receipt" | "voice") {
  const form = new FormData();
  form.append("file", file, filename);
  form.append("kind", kind);
  return fetch(`${API}/api/upload`, { method: "POST", body: form }).then(json<{ attachment_id: string }>);
}

/** POST to an SSE endpoint and call onEvent for every `data:` frame as it arrives. */
export async function streamPost(path: string, body: unknown, onEvent: (e: StreamEvent) => void) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

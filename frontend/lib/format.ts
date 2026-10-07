export const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

/** Unwrap an MCP tool result ({content:[{type:"text",text:"<json>"}]}) into plain data. */
export function unwrap(result: unknown): unknown {
  const r = result as { content?: { type: string; text: string }[] } | null;
  const text = r?.content?.find((c) => c.type === "text")?.text;
  if (typeof text === "string") {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return result;
}

export function brief(value: unknown, max = 96): string {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export const agentKey = (name: string) => name.replace(/_agent$/, "");

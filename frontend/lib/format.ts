let currency = "INR";
/** Called once the signed-in user's preference is known; every money() call after that uses it. */
export const setCurrency = (code: string) => { currency = code; };
const fmt = (digits: number) =>
  new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
/** Whole-unit amount, e.g. ₹7,420. */
export const money = (n: number) => fmt(0).format(Math.round(n));

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

/** "Wed 8 Oct" from an ISO date (parsed as local noon so timezones never shift the day). */
export const dayLabel = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

/** Exact amount: paise/cents only when the value has them. */
export const moneyExact = (n: number) => fmt(Number.isInteger(n) ? 0 : 2).format(n);

/** Stable CSS colour token per category (defined in globals.css). */
export const catVar = (c: string) => `var(--cat-${c.toLowerCase()})`;

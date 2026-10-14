import type { Dashboard } from "./types";

export type Item = { id: string; kind: "budgets" | "family" | "tips"; tone: "bad" | "warn" | "ok" | "tip"; title: string; body: string; when: string; group: "Today" | "This week" };

const ago = (iso?: string) => {
  if (!iso) return { when: "", group: "Today" as const };
  const d = new Date(iso.includes("T") || iso.includes(" ") ? iso.replace(" ", "T") : iso + "T12:00:00");
  const days = (Date.now() - d.getTime()) / 86400000;
  return {
    group: days < 1 ? ("Today" as const) : ("This week" as const),
    when: days < 1 ? d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString("en-IN", { weekday: "short" }),
  };
};

/** Turns the dashboard's alerts and advice into one list for the Alerts screen. */
export function buildAlerts(dash: Dashboard | null): Item[] {
  if (!dash) return [];
  const out: Item[] = [];
  dash.alerts.forEach((a, i) => {
    const t = ago(a.created_at);
    const over = a.level === "exceeded";
    out.push({
      id: `a${i}`, kind: a.scope === "family" ? "family" : "budgets", tone: over ? "bad" : "warn",
      title: a.scope === "family" ? `Family ${a.category} at ${Math.round(a.pct)}%` : over ? `${a.category} is over budget` : `${a.category} is near its limit`,
      body: a.message, ...t,
    });
  });
  dash.advice.forEach((a, i) => out.push({ id: `t${i}`, kind: "tips", tone: "tip", title: "A way to save", body: a.text, ...ago(a.created_at) }));
  return out;
}

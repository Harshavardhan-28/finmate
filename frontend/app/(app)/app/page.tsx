"use client";
import Link from "next/link";
import { useApp } from "@/components/app/AppProvider";
import { Alerts, Breakdown, Daily } from "@/components/app/Parts";
import { catVar, dayLabel, money, moneyExact } from "@/lib/format";

export default function Overview() {
  const { user, dash, expenses } = useApp();
  if (!dash) return <div className="page"><p className="muted">Loading your household…</p></div>;

  const monthKey = dash.budgets.month;
  const monthName = new Date(monthKey + "-01T12:00:00").toLocaleString("en-IN", { month: "long", year: "numeric" });
  const monthExp = expenses.filter((e) => e.date.startsWith(monthKey));
  const total = monthExp.reduce((s, e) => s + e.amount, 0);

  const cats = new Map<string, number>();
  const byDay = new Map<number, number>();
  monthExp.forEach((e) => {
    cats.set(e.category, (cats.get(e.category) ?? 0) + e.amount);
    const d = Number(e.date.slice(8, 10));
    byDay.set(d, (byDay.get(d) ?? 0) + e.amount);
  });
  const catRows = [...cats.entries()].sort((a, b) => b[1] - a[1]);

  const now = new Date();
  const isCurrent = monthKey === now.toISOString().slice(0, 7);
  const today = isCurrent ? now.getDate() : 0;
  const elapsed = isCurrent ? now.getDate() : new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0).getDate();

  const all = [...dash.budgets.personal, ...dash.budgets.family];
  const over = all.filter((b) => b.level === "exceeded");
  const near = all.filter((b) => b.level === "warning");
  const attention = [...over, ...near].slice(0, 4);

  return (
    <>
    <title>Overview · FinMate AI</title>
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{monthName}</p>
          <h1>{user.name}&apos;s money</h1>
        </div>
      </header>

      <div className="kpis">
        <div className="kpi">
          <span className="kpi-label">Spent this month</span>
          <span className="kpi-value">{money(total)}</span>
          <span className="kpi-sub">{monthExp.length} {monthExp.length === 1 ? "expense" : "expenses"}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Daily average</span>
          <span className="kpi-value">{money(total / Math.max(1, elapsed))}</span>
          <span className="kpi-sub">over {elapsed} {elapsed === 1 ? "day" : "days"}</span>
        </div>
        <div className="kpi" data-tone={over.length ? "bad" : near.length ? "warn" : "ok"}>
          <span className="kpi-label">Budgets</span>
          <span className="kpi-value">{over.length ? `${over.length} over` : near.length ? `${near.length} near` : "On track"}</span>
          <span className="kpi-sub">{all.length ? `${over.length} over · ${near.length} near limit` : "none set yet"}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Top category</span>
          <span className="kpi-value">{catRows[0]?.[0] ?? "—"}</span>
          <span className="kpi-sub">{catRows[0] ? `${money(catRows[0][1])} · ${Math.round((catRows[0][1] / total) * 100)}%` : "nothing yet"}</span>
        </div>
      </div>

      <div className="split">
        <section className="sect">
          <div className="sect-head"><h2>Where it went</h2></div>
          <Breakdown rows={catRows} total={total} />
        </section>
        <section className="sect">
          <div className="sect-head"><h2>Day by day</h2><span className="sect-meta">{monthName}</span></div>
          <Daily month={monthKey} byDay={byDay} today={today} />
        </section>
      </div>

      <div className="split">
        <section className="sect">
          <div className="sect-head"><h2>Needs attention</h2><Link className="sect-link" href="/app/budgets">All budgets</Link></div>
          {attention.length ? (
            attention.map((b) => (
              <div className={`alert ${b.level}`} key={b.category + b.limit}>
                <b>{b.category}</b>
                <span>{Math.round(b.pct)}% used · {money(b.spent)} of {money(b.limit)}</span>
              </div>
            ))
          ) : (
            <p className="muted">{all.length ? "Every budget is under its warning line." : "No budgets yet. Set one from the Budgets page."}</p>
          )}
          <div className="sect-sub">Latest alerts</div>
          <Alerts items={dash.alerts} warn={user.warn_pct} />
        </section>
        <section className="sect">
          <div className="sect-head"><h2>Advice</h2><span className="sect-meta">from the Insights Agent</span></div>
          {dash.advice.length ? (
            dash.advice.map((a, i) => <div className="advice" key={i}>{a.text}</div>)
          ) : (
            <p className="muted">Nothing yet. Ask the <Link href="/app/assistant" className="textlink">assistant</Link> where you can save money.</p>
          )}
        </section>
      </div>

      <section className="sect">
        <div className="sect-head"><h2>Latest expenses</h2><Link className="sect-link" href="/app/expenses">See all</Link></div>
        {expenses.slice(0, 6).map((e) => (
          <div className="entry compact" key={e.id}>
            <i className="swatch" style={{ background: catVar(e.category) }} aria-hidden />
            <div className="entry-main"><b>{e.merchant}</b><span>{dayLabel(e.date)} · {e.category}</span></div>
            <span className="entry-amt">{moneyExact(e.amount)}</span>
          </div>
        ))}
        {!expenses.length && <p className="muted">No expenses yet.</p>}
      </section>
    </div>
    </>
  );
}

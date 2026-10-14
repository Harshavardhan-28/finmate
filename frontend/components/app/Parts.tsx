"use client";
import type { Alert, Budget } from "@/lib/types";
import { catVar, money } from "@/lib/format";

export function Meter({
  rows, empty, warn = 80, actions,
}: {
  rows: Budget[]; empty: string; warn?: number;
  actions?: (b: Budget) => React.ReactNode;
}) {
  if (!rows.length) return <p className="muted">{empty}</p>;
  return (
    <div className="meters">
      {rows.map((b) => (
        <div className="meter" key={b.category}>
          <div className="meter-top">
            <span className="meter-name"><i style={{ background: catVar(b.category) }} />{b.category}</span>
            <span className="pct" data-level={b.level}>{Math.round(b.pct)}%</span>
          </div>
          <div className="bar" style={{ ["--warn" as string]: `${warn}%` }} role="progressbar"
            aria-valuenow={Math.round(b.pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${b.category} budget`}>
            <i data-level={b.level} style={{ width: `${Math.min(100, b.pct)}%` }} />
          </div>
          <div className="meter-sub">
            <span>{money(b.spent)} of {money(b.limit)}</span>
            {actions?.(b)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Alerts({ items, warn = 80 }: { items: Alert[]; warn?: number }) {
  if (!items.length)
    return <p className="muted">All clear. You&apos;ll be warned at {warn}% and again at 100% of any limit.</p>;
  return (
    <>
      {items.slice(0, 4).map((a, i) => (
        <div key={i} className={`alert ${a.level}`}>
          <b>{a.level === "exceeded" ? "Over limit" : "Near limit"}</b>
          <span>{a.message}</span>
        </div>
      ))}
    </>
  );
}

/** One stacked strip for the month, then a ranked legend. */
export function Breakdown({ rows, total }: { rows: [string, number][]; total: number }) {
  if (!rows.length) return <p className="muted">No spending recorded this month.</p>;
  return (
    <div>
      <div className="strip" role="img" aria-label="Spending by category this month">
        {rows.map(([c, v]) => <i key={c} style={{ flexGrow: v, background: catVar(c) }} title={`${c} ${money(v)}`} />)}
      </div>
      <ul className="legend">
        {rows.map(([c, v]) => (
          <li key={c}>
            <i style={{ background: catVar(c) }} />
            <span>{c}</span>
            <b>{money(v)}</b>
            <small>{Math.round((v / total) * 100)}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Spend per day of the month as plain SVG bars (no chart library needed). */
export function Daily({ month, byDay, today }: { month: string; byDay: Map<number, number>; today: number }) {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  const max = Math.max(1, ...byDay.values());
  const W = 600, H = 96, gap = 3, bw = (W - gap * (n - 1)) / n;
  const mon = new Date(y, m - 1).toLocaleString("en-IN", { month: "short" });
  return (
    <figure className="daily">
      <svg viewBox={`0 0 ${W} ${H + 16}`} role="img" aria-label="Daily spending this month" preserveAspectRatio="none">
        <line x1="0" x2={W} y1={H} y2={H} className="axis" />
        {Array.from({ length: n }, (_, i) => {
          const v = byDay.get(i + 1) ?? 0;
          const h = v ? Math.max(3, (v / max) * (H - 6)) : 0;
          return (
            <g key={i}>
              {v > 0 && (
                <rect x={i * (bw + gap)} y={H - h} width={bw} height={h} rx="1.5" className={i + 1 === today ? "bar-today" : "bar-day"}>
                  <title>{`${i + 1} ${mon}: ${money(v)}`}</title>
                </rect>
              )}
              {(i === 0 || (i + 1) % 5 === 0) && <text x={i * (bw + gap) + bw / 2} y={H + 12} className="tick">{i + 1}</text>}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

"use client";
import type { Alert, Budget, Dashboard } from "@/lib/types";
import { inr } from "@/lib/format";

function Bars({ rows, empty }: { rows: Budget[]; empty: string }) {
  if (!rows.length) return <p className="muted">{empty}</p>;
  return (
    <>
      {rows.map((b) => (
        <div className="bar-row" key={b.category}>
          <div className="bar-label">
            <span>{b.category}</span>
            <span>
              <span className="pct" data-level={b.level}>{Math.round(b.pct)}%</span> · {inr(b.spent)} of {inr(b.limit)}
            </span>
          </div>
          <div
            className="bar"
            role="progressbar"
            aria-valuenow={Math.round(b.pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${b.category} budget`}
          >
            <i data-level={b.level} style={{ width: `${Math.min(100, b.pct)}%` }} />
          </div>
        </div>
      ))}
    </>
  );
}

function Alerts({ items }: { items: Alert[] }) {
  if (!items.length) return <p className="muted">No alerts. The Budget Agent warns you at 80% and 100% of a limit.</p>;
  return (
    <>
      {items.slice(0, 4).map((a, i) => (
        <div key={i} className={`alert ${a.level}`}>
          <b>{a.level === "exceeded" ? "Over limit" : "80% reached"}</b>
          <span>{a.message}</span>
        </div>
      ))}
    </>
  );
}

export default function DashboardView({ data }: { data: Dashboard | null }) {
  if (!data)
    return (
      <div className="dash">
        <p className="muted">Loading your household…</p>
      </div>
    );
  const fam = data.family;
  const month = new Date(data.budgets.month + "-01").toLocaleString("en-IN", { month: "long", year: "numeric" });
  return (
    <div className="dash">
      <div className="dash-head">
        <div>
          <h1>{data.user.name}&apos;s money</h1>
          <p>{month} · Sharma Family</p>
        </div>
        <span className="chip">{data.user.role === "admin" ? "Family admin" : "Family member"}</span>
      </div>

      <div className="grid2">
        <section className="card">
          <h2>
            Your budgets <small>tick = 80% warning</small>
          </h2>
          <Bars rows={data.budgets.personal} empty="No personal budgets yet. Ask the assistant to set one." />
        </section>
        <section className="card">
          <h2>
            Family budgets <small>shared</small>
          </h2>
          <Bars rows={data.budgets.family} empty="No family budgets yet." />
        </section>
      </div>

      <div className="grid2">
        <section className="card">
          <h2>Alerts</h2>
          <Alerts items={data.alerts} />
        </section>
        <section className="card">
          <h2>Advice from the Insights Agent</h2>
          {data.advice.length ? (
            data.advice.map((a, i) => (
              <div className="advice" key={i}>
                {a.text}
              </div>
            ))
          ) : (
            <p className="muted">Nothing yet. Ask &quot;Where can I save money?&quot;.</p>
          )}
        </section>
      </div>

      <section className="card">
        <h2>
          Household view <small>Family Agent · admin only</small>
        </h2>
        {"error" in fam ? (
          <div className="locked">
            <span className="chip bad">Restricted</span>
            <span>
              The household view is only for the family admin. You can see your own spending and the shared family budgets.
            </span>
          </div>
        ) : (
          <>
            <div className="muted">Household spend this month</div>
            <div className="big">{inr(fam.household_total)}</div>
            {fam.members.map((m) => (
              <div className="member" key={m.user_id}>
                <span>
                  <b>{m.name}</b> <span className="muted">· {m.role}</span>
                </span>
                <b>{inr(m.spent)}</b>
              </div>
            ))}
            {fam.recent_alerts.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="muted" style={{ marginBottom: 6 }}>Member alerts</div>
                {fam.recent_alerts.slice(0, 3).map((a, i) => (
                  <div key={i} className={`alert ${a.level}`}>
                    <b>{a.user}</b>
                    <span>{a.message}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section className="card">
        <h2>
          Recent expenses <small>last 30 days</small>
        </h2>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th><th>Merchant</th><th>Category</th><th>Via</th><th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.recent_expenses.map((e) => (
              <tr key={e.id}>
                <td>{e.date.slice(5)}</td>
                <td>{e.merchant}</td>
                <td>{e.category}</td>
                <td><span className="src">{e.source}</span></td>
                <td className="num">{inr(e.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

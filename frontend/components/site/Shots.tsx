import { Meter } from "@/components/app/Parts";
import { catVar, money } from "@/lib/format";
import type { Budget } from "@/lib/types";

/** Product visuals for the public pages. They reuse the app's real components and CSS, with fixed sample data. */
function Frame({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <figure className={`shot ${className}`}>
      <div className="shot-body">{children}</div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

const SAMPLE_BUDGETS: Budget[] = [
  { category: "Transport", limit: 8000, spent: 8960, pct: 112, level: "exceeded" },
  { category: "Food", limit: 4000, spent: 3400, pct: 85, level: "warning" },
  { category: "Groceries", limit: 9000, spent: 3700, pct: 41.1, level: "ok" },
];

export function BudgetShot({ className }: { className?: string }) {
  return (
    <Frame label="Example data: personal budgets for October" className={className}>
      <div className="sect-head"><h2>Your budgets</h2><span className="sect-meta">tick marks 80%</span></div>
      <Meter rows={SAMPLE_BUDGETS} empty="" />
    </Frame>
  );
}

export function AlertShot({ className }: { className?: string }) {
  return (
    <Frame label="Example data: alerts raised when an expense is saved" className={className}>
      <div className="alert exceeded"><b>Over limit</b><span>Your Transport budget is at 112% of its monthly limit - limit exceeded.</span></div>
      <div className="alert warning"><b>Near limit</b><span>The Sharma family Food budget is at 82% of its monthly limit.</span></div>
    </Frame>
  );
}

export function CaptureShot({ className }: { className?: string }) {
  return (
    <Frame label="Example data: the confirm step before anything is saved" className={className}>
      <div className="confirm" style={{ border: 0, padding: 0 }}>
        <h3>Confirm this expense</h3>
        <div className="sub">Read from your receipt. Fix anything that is off before saving.</div>
        <div className="fields">
          <label className="field">Amount<input readOnly value="450" /></label>
          <label className="field">Date<input readOnly value="2026-10-08" /></label>
          <label className="field">Merchant<input readOnly value="Uber" /></label>
          <label className="field unclear">Category<input readOnly value="Transport" /></label>
          <label className="field wide">Note<input readOnly value="Home to Office" /></label>
        </div>
        <div className="confirm-actions">
          <span className="btn primary">Confirm and save</span>
          <span className="btn">Discard</span>
        </div>
      </div>
    </Frame>
  );
}

const BILL_ITEMS = [
  ["Rice 5 kg", "Groceries", 420],
  ["Atta 10 kg", "Groceries", 510],
  ["Vitamin C", "Health", 180],
] as const;

export function LedgerShot({ className }: { className?: string }) {
  const billTotal = BILL_ITEMS.reduce((s, i) => s + i[2], 0);
  return (
    <Frame label="Example data: the expense ledger, with one bill expanded" className={className}>
      <div className="day-head" style={{ paddingTop: 0 }}><span>Wed 8 Oct</span><span>{money(billTotal + 440)}</span></div>
      <div className="entry" style={{ gridTemplateColumns: "4px minmax(0,1fr) auto auto" }}>
        <i className="swatch" style={{ background: catVar("Transport") }} />
        <div className="entry-main"><b>Uber</b><span>Transport · Home to Office</span></div>
        <span className="src">receipt</span>
        <span className="entry-amt">{money(440)}</span>
      </div>
      <div className="entry" style={{ gridTemplateColumns: "4px minmax(0,1fr) auto auto" }}>
        <i className="swatch" style={{ background: `linear-gradient(to bottom, ${catVar("Groceries")} 0 84%, ${catVar("Health")} 84% 100%)` }} />
        <div className="entry-main"><b>DMart</b><span>3 items · hide items</span></div>
        <span className="src">bill</span>
        <span className="entry-amt">{money(billTotal)}</span>
      </div>
      <ul className="bill-items">
        {BILL_ITEMS.map(([n, c, a]) => (
          <li key={n}><i style={{ background: catVar(c) }} /><span className="bi-name">{n}</span><span className="bi-cat">{c}</span><span className="bi-amt">{money(a)}</span></li>
        ))}
      </ul>
    </Frame>
  );
}

export function InsightShot({ className }: { className?: string }) {
  return (
    <Frame label="Example data: advice built from the demo household's own history" className={className}>
      <div className="sect-head"><h2>Advice</h2><span className="sect-meta">Insights Agent</span></div>
      <div className="advice">
        You took 18 cab rides on <b>Home to Office</b> in the last 30 days. A metro ride on that route is about ₹60,
        against ₹400+ for a cab. Switching even half of them would save a few thousand rupees a month.
      </div>
      <div className="advice">Food delivery is your second-largest category. Cooking at home two or three more times a week avoids the 30-40% delivery markup.</div>
    </Frame>
  );
}

export function HouseholdShot({ className }: { className?: string }) {
  return (
    <Frame label="Example data: the admin's household view" className={className}>
      <div className="household-total"><span className="muted">Household spend this month</span><b>{money(19340)}</b></div>
      <div className="member"><span><b>Ravi</b> <span className="muted">· admin</span></span><b>{money(12010)}</b></div>
      <div className="member"><span><b>Priya</b> <span className="muted">· member</span></span><b>{money(7330)}</b></div>
      <div className="alert exceeded" style={{ marginTop: 10 }}><b>Ravi</b><span>Transport budget is at 112% of its monthly limit.</span></div>
    </Frame>
  );
}

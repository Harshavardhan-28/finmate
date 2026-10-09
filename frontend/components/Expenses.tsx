"use client";
import { useMemo, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { Expense } from "@/lib/types";
import { catVar, dayLabel, moneyExact } from "@/lib/format";

const RANGES = [
  { key: "month", label: "This month" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
] as const;
type Range = (typeof RANGES)[number]["key"];
const PAGE = 40;

type Entry = { kind: "one"; e: Expense } | { kind: "bill"; id: number; items: Expense[] };

/** Fold a day's expenses so every item of one bill collapses into a single entry. */
function group(list: Expense[]): Entry[] {
  const out: Entry[] = [];
  const bills = new Map<number, Extract<Entry, { kind: "bill" }>>();
  for (const e of list) {
    if (e.bill_id == null) { out.push({ kind: "one", e }); continue; }
    let b = bills.get(e.bill_id);
    if (!b) { b = { kind: "bill", id: e.bill_id, items: [] }; bills.set(e.bill_id, b); out.push(b); }
    b.items.push(e);
  }
  return out;
}

/** A bar split by category, in proportion to each item's amount. */
function billSwatch(items: Expense[]) {
  const total = items.reduce((s, i) => s + i.amount, 0) || 1;
  let at = 0;
  const stops = items.map((i) => {
    const from = at; at += (i.amount / total) * 100;
    return `${catVar(i.category)} ${from}% ${at}%`;
  });
  return `linear-gradient(to bottom, ${stops.join(", ")})`;
}

function BillEntry({ b, onDeleteBill }: { b: Extract<Entry, { kind: "bill" }>; onDeleteBill?: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const items = [...b.items].sort((x, y) => x.id - y.id); // items in the order they were entered
  const merchant = items[0].merchant;
  const total = b.items.reduce((s, i) => s + i.amount, 0);
  const n = b.items.length;
  return (
    <div className="bill">
      <div className="entry">
        <i className="swatch" style={{ background: billSwatch(b.items) }} aria-hidden />
        <button className="entry-main bill-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <b>{merchant}</b>
          <span>{n} {n === 1 ? "item" : "items"} · {open ? "hide items" : "show items"}</span>
        </button>
        <span className="src">bill</span>
        <span className="entry-amt">{moneyExact(total)}</span>
        {onDeleteBill && (
          <ConfirmDialog
            title="Delete this whole bill?"
            description={<>{merchant} · {n} {n === 1 ? "item" : "items"} · {moneyExact(total)} will all be removed and your budgets recalculated.</>}
            onConfirm={() => onDeleteBill(b.id)}
            trigger={<button className="entry-x" aria-label={`Delete ${merchant} bill`}>×</button>}
          />
        )}
      </div>
      {open && (
        <ul className="bill-items">
          {items.map((i) => (
            <li key={i.id}>
              <i style={{ background: catVar(i.category) }} aria-hidden />
              <span className="bi-name">{i.note || "Item"}</span>
              <span className="bi-cat">{i.category}</span>
              <span className="bi-amt">{moneyExact(i.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Expenses({
  expenses, month, onDelete, onDeleteBill, heading = true,
}: {
  expenses: Expense[]; month: string; onDelete?: (e: Expense) => void; onDeleteBill?: (id: number) => void; heading?: boolean;
}) {
  const [range, setRange] = useState<Range>("month");
  const [category, setCategory] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const inRange = useMemo(() => {
    if (range === "month") return expenses.filter((e) => e.date.startsWith(month));
    const newest = expenses.reduce((m, e) => (e.date > m ? e.date : m), "");
    if (!newest) return [];
    const cutoff = new Date(newest + "T12:00:00");
    cutoff.setDate(cutoff.getDate() - Number(range));
    const iso = cutoff.toISOString().slice(0, 10);
    return expenses.filter((e) => e.date > iso);
  }, [expenses, range, month]);

  const categories = useMemo(() => {
    const t = new Map<string, number>();
    inRange.forEach((e) => t.set(e.category, (t.get(e.category) ?? 0) + e.amount));
    return [...t.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [inRange]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inRange.filter(
      (e) =>
        (!category || e.category === category) &&
        (!needle || `${e.merchant} ${e.note} ${e.category}`.toLowerCase().includes(needle)),
    );
  }, [inRange, category, q]);

  const total = rows.reduce((s, e) => s + e.amount, 0);
  const entryCount = rows.filter((e) => e.bill_id == null).length + new Set(rows.filter((e) => e.bill_id != null).map((e) => e.bill_id)).size;
  const shown = rows.slice(0, limit);
  const days = useMemo(() => {
    const g = new Map<string, Expense[]>();
    shown.forEach((e) => g.set(e.date, [...(g.get(e.date) ?? []), e]));
    return [...g.entries()];
  }, [shown]);

  const reset = () => setLimit(PAGE);

  return (
    <section className="sect" aria-labelledby="ledger-h">
      <div className="sect-head">
        <h2 id="ledger-h" className={heading ? undefined : "sr-only"}>Expenses</h2>
        <span className="sect-meta">
          {entryCount} {entryCount === 1 ? "entry" : "entries"} · <b>{moneyExact(total)}</b>
        </span>
      </div>

      <div className="ledger-tools">
        <div className="seg" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button key={r.key} aria-pressed={range === r.key} onClick={() => { setRange(r.key); setCategory(null); reset(); }}>
              {r.label}
            </button>
          ))}
        </div>
        <input
          className="search" type="search" placeholder="Search merchant or note" aria-label="Search expenses"
          value={q} onChange={(e) => { setQ(e.target.value); reset(); }}
        />
      </div>

      <div className="filters" role="group" aria-label="Filter by category">
        <button aria-pressed={category === null} onClick={() => { setCategory(null); reset(); }}>All</button>
        {categories.map((c) => (
          <button key={c} aria-pressed={category === c} onClick={() => { setCategory(category === c ? null : c); reset(); }}>
            <i style={{ background: catVar(c) }} />{c}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="muted pad">Nothing matches. {expenses.length === 0 ? "Add a bill above, or scan a receipt from Receipts." : "Try a wider range or clear the filters."}</p>
      ) : (
        <div className="ledger">
          {days.map(([date, list]) => (
            <div className="day" key={date}>
              <div className="day-head">
                <span>{dayLabel(date)}</span>
                <span>{moneyExact(list.reduce((s, e) => s + e.amount, 0))}</span>
              </div>
              {group(list).map((g) =>
                g.kind === "bill" ? (
                  <BillEntry key={`b${g.id}`} b={g} onDeleteBill={onDeleteBill} />
                ) : (
                  <div className="entry" key={g.e.id}>
                    <i className="swatch" style={{ background: catVar(g.e.category) }} aria-hidden />
                    <div className="entry-main">
                      <b>{g.e.merchant}</b>
                      <span>{g.e.note ? `${g.e.category} · ${g.e.note}` : g.e.category}</span>
                    </div>
                    <span className="src">{g.e.source}</span>
                    <span className="entry-amt">{moneyExact(g.e.amount)}</span>
                    {onDelete && (
                      <ConfirmDialog
                        title="Delete this expense?"
                        description={<>{g.e.merchant} · {moneyExact(g.e.amount)} on {dayLabel(g.e.date)} will be removed and your budgets recalculated.</>}
                        onConfirm={() => onDelete(g.e)}
                        trigger={<button className="entry-x" aria-label={`Delete ${g.e.merchant} expense`}>×</button>}
                      />
                    )}
                  </div>
                ),
              )}
            </div>
          ))}
          {rows.length > shown.length && (
            <button className="btn more" onClick={() => setLimit((l) => l + PAGE)}>
              Show {Math.min(PAGE, rows.length - shown.length)} more
            </button>
          )}
        </div>
      )}
    </section>
  );
}

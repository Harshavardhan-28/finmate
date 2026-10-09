"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import Pick from "@/components/Pick";
import { Field, Notice, useAction } from "@/components/ui";
import { addBill } from "@/lib/api";
import { money } from "@/lib/format";
import { CATEGORIES } from "@/lib/types";
import { useApp } from "./AppProvider";

type Row = { id: number; name: string; category: string; amount: string };
const today = () => new Date().toISOString().slice(0, 10);

/** One bill, many items. Each item has its own category, and they are stored together as a single bill. */
export default function BillForm({ onDone, onCancel }: { onDone?: () => void; onCancel?: () => void }) {
  const { refresh } = useApp();
  const nextId = useRef(2);
  const [merchant, setMerchant] = useState("");
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<Row[]>([{ id: 1, name: "", category: "Groceries", amount: "" }]);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [problem, setProblem] = useState("");

  const patch = (id: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const addRow = () => {
    const id = nextId.current++;
    setRows((rs) => [...rs, { id, name: "", category: rs[rs.length - 1]?.category ?? "Groceries", amount: "" }]);
    setFocusId(id);
  };
  const total = rows.reduce((s, r) => s + (Number(r.amount) > 0 ? Number(r.amount) : 0), 0);

  const save = useAction(async () => {
    const filled = rows.filter((r) => r.name.trim() || r.amount);
    if (!merchant.trim()) return setProblem("Enter where the bill is from.");
    if (!filled.length) return setProblem("Add at least one item.");
    if (filled.some((r) => !(Number(r.amount) > 0))) return setProblem("Every item needs an amount greater than zero.");
    setProblem("");
    const r = await addBill({
      merchant, date,
      items: filled.map((i) => ({ name: i.name.trim(), amount: Number(i.amount), category: i.category })),
    });
    await refresh();
    toast.success(`Bill saved: ${merchant.trim()} · ${r.bill.items.length} ${r.bill.items.length === 1 ? "item" : "items"} · ${money(r.bill.total)}`);
    r.alerts.forEach((a) => (a.level === "exceeded" ? toast.error(a.message) : toast.warning(a.message)));
    setMerchant(""); setRows([{ id: nextId.current++, name: "", category: "Groceries", amount: "" }]);
    onDone?.();
  });

  return (
    <form className="billform" onSubmit={(e) => { e.preventDefault(); void save.run(); }}>
      <div className="billform-top">
        <Field label="Bill from"><input required value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="e.g. DMart" autoComplete="off" /></Field>
        <Field label="Date"><input required type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>

      <div className="bill-grid" role="group" aria-label="Bill items">
        <div className="bill-row head" aria-hidden>
          <span>Item</span><span>Category</span><span className="r">Amount</span><span />
        </div>
        {rows.map((r, i) => (
          <div className="bill-row" key={r.id}>
            <input className="b-name" aria-label={`Item ${i + 1} name`} placeholder="Item, e.g. Rice 5 kg" value={r.name}
              autoFocus={r.id === focusId} onChange={(e) => patch(r.id, { name: e.target.value })} />
            <Pick className="b-cat" label={`Item ${i + 1} category`} value={r.category} onChange={(category) => patch(r.id, { category })}
              options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
            <input aria-label={`Item ${i + 1} amount`} className="b-amt r" type="number" min="0.01" step="0.01" placeholder="0.00"
              value={r.amount} onChange={(e) => patch(r.id, { amount: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && i === rows.length - 1 && r.amount) { e.preventDefault(); addRow(); } }} />
            <button type="button" className="rowx" aria-label={`Remove item ${i + 1}`} disabled={rows.length === 1}
              onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>×</button>
          </div>
        ))}
      </div>

      <div className="billform-foot">
        <button type="button" className="btn sm" onClick={addRow}>+ Add item</button>
        <span className="bill-total">{rows.filter((r) => Number(r.amount) > 0).length} items · Total <b>{money(total)}</b></span>
      </div>
      {(problem || save.error) && <Notice tone="bad">{problem || save.error}</Notice>}
      <div className="actions" style={{ justifyContent: "flex-start" }}>
        <button className="btn primary" disabled={save.busy}>{save.busy ? "Saving…" : "Save bill"}</button>
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

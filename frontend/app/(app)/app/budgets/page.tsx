"use client";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useApp } from "@/components/app/AppProvider";
import { Meter } from "@/components/app/Parts";
import Pick from "@/components/Pick";
import { Field, Notice, useAction } from "@/components/ui";
import { toast } from "sonner";
import { deleteBudget, putBudget } from "@/lib/api";
import { money } from "@/lib/format";
import { CATEGORIES, type Budget } from "@/lib/types";

function Editor({ scope, rows, canEdit, warn }: { scope: "user" | "family"; rows: Budget[]; canEdit: boolean; warn: number }) {
  const { refresh } = useApp();
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [cat, setCat] = useState("");
  const free = CATEGORIES.filter((c) => !rows.some((r) => r.category === c));
  const save = useAction(async (category: string, limit: number) => {
    await putBudget(scope, category, limit);
    await refresh();
    toast.success(`${category} budget set to ${money(limit)}`);
    setEditing(null); setAdding(false); setValue("");
  });
  const remove = useAction(async (category: string) => { await deleteBudget(scope, category); await refresh(); toast.success(`${category} budget removed`); });

  return (
    <>
      <Meter
        rows={rows} warn={warn}
        empty={scope === "user" ? "No personal budgets yet." : "No family budgets yet."}
        actions={canEdit ? (b) =>
          editing === b.category ? (
            <form className="budget-edit" onSubmit={(e) => { e.preventDefault(); void save.run(b.category, Number(value)); }}>
              <input autoFocus type="number" min="1" aria-label={`${b.category} monthly limit`} value={value} onChange={(e) => setValue(e.target.value)} />
              <button className="btn sm primary" disabled={save.busy}>Save</button>
              <button type="button" className="btn sm ghost" onClick={() => setEditing(null)}>Cancel</button>
            </form>
          ) : (
            <span className="actions">
              <button className="btn sm ghost" onClick={() => { setEditing(b.category); setValue(String(b.limit)); }}>Change limit</button>
              <ConfirmDialog
                title={`Remove the ${b.category} budget?`}
                description="Spending in this category stays recorded; you just stop being warned about it."
                confirmLabel="Remove"
                onConfirm={() => void remove.run(b.category)}
                trigger={<button className="btn sm ghost" disabled={remove.busy}>Remove</button>}
              />
            </span>
          ) : undefined}
      />
      {(save.error || remove.error) && <Notice tone="bad">{save.error || remove.error}</Notice>}
      {canEdit && (adding ? (
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); void save.run(cat || free[0], Number(value)); }}>
          <Field label="Category">
            <Pick label="Category" value={cat || free[0]} onChange={setCat} options={free.map((c) => ({ value: c, label: c }))} />
          </Field>
          <Field label="Monthly limit"><input required autoFocus type="number" min="1" value={value} onChange={(e) => setValue(e.target.value)} /></Field>
          <span className="actions">
            <button className="btn primary" disabled={save.busy}>Add budget</button>
            <button type="button" className="btn ghost" onClick={() => { setAdding(false); setValue(""); }}>Cancel</button>
          </span>
        </form>
      ) : free.length > 0 && (
        <div><button className="btn" onClick={() => { setAdding(true); setValue(""); setCat(""); }}>Add a budget</button></div>
      ))}
    </>
  );
}

export default function BudgetsPage() {
  const { user, dash } = useApp();
  if (!dash) return <div className="page"><p className="muted">Loading…</p></div>;
  const b = dash.budgets;
  const total = (rows: Budget[]) => rows.reduce((s, r) => s + r.limit, 0);
  return (
    <>
      <title>Budgets · FinMate AI</title>
      <div className="page">
        <header className="page-head">
          <div>
            <p className="eyebrow">Monthly limits</p>
            <h1>Budgets</h1>
            <p>
              You&apos;re warned when a budget reaches {user.warn_pct}% and again at 100%. Change that line in{" "}
              <a className="textlink" href="/app/settings/preferences">Preferences</a>.
            </p>
          </div>
        </header>
        <div className="split">
          <section className="sect">
            <div className="sect-head"><h2>Your budgets</h2><span className="sect-meta">{money(total(b.personal))} / month</span></div>
            <Editor scope="user" rows={b.personal} canEdit warn={b.warn_pct} />
          </section>
          <section className="sect">
            <div className="sect-head">
              <h2>Family budgets</h2>
              <span className="sect-meta">{user.role === "admin" ? `${money(total(b.family))} / month` : "view only"}</span>
            </div>
            <Editor scope="family" rows={b.family} canEdit={user.role === "admin"} warn={b.warn_pct} />
            {user.role !== "admin" && <p className="muted" style={{ marginTop: 14 }}>Only the family admin can change shared budgets.</p>}
          </section>
        </div>
      </div>
    </>
  );
}

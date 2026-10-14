"use client";
import { useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import Pick from "@/components/Pick";
import { Field, Notice, useAction } from "@/components/ui";
import { updatePreferences } from "@/lib/api";

const CURRENCIES = [["INR", "Indian rupee (₹)"], ["USD", "US dollar ($)"], ["EUR", "Euro (€)"], ["GBP", "British pound (£)"]];

export default function Preferences() {
  const { user, setUser, refresh } = useApp();
  const [currency, setCurrency] = useState(user.currency);
  const [warn, setWarn] = useState(user.warn_pct);
  const save = useAction(async () => { setUser(await updatePreferences(currency, warn)); await refresh(); }, "Preferences saved.");
  const dirty = currency !== user.currency || warn !== user.warn_pct;
  return (
    <>
      <title>Preferences · FinMate AI</title>
      <form className="setting-form" onSubmit={(e) => { e.preventDefault(); void save.run(); }}>
        <div className="setting">
          <div><h2>Currency</h2><p>How amounts are shown. Existing amounts are not converted; this only changes the symbol and grouping.</p></div>
          <div className="formcard">
            <Field label="Display currency">
              <Pick label="Display currency" value={currency} onChange={setCurrency}
                options={CURRENCIES.map(([c, l]) => ({ value: c, label: l }))} />
            </Field>
          </div>
        </div>
        <div className="setting">
          <div><h2>Warning threshold</h2><p>You get a warning when a budget reaches this share of its limit, and an &ldquo;over limit&rdquo; alert at 100%.</p></div>
          <div className="formcard">
            <div className="range-row">
              <input type="range" min={50} max={95} step={5} value={warn} onChange={(e) => setWarn(Number(e.target.value))} aria-label="Warning threshold percent" />
              <span className="range-val">{warn}%</span>
            </div>
            <div className="preview-bar" aria-hidden><i style={{ width: `${warn}%` }} /><b style={{ left: `${warn}%`, right: 0 }} /></div>
            <span className="fld-hint">The bar turns amber after {warn}% and red at 100%.</span>
            {save.error && <Notice tone="bad">{save.error}</Notice>}
            <div><button className="btn primary" disabled={save.busy || !dirty}>{save.busy ? "Saving…" : "Save preferences"}</button></div>
          </div>
        </div>
      </form>
    </>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app/AppProvider";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Field, Notice, PasswordInput, useAction } from "@/components/ui";
import { deleteAccount, downloadExport } from "@/lib/api";

export default function DataSettings() {
  const router = useRouter();
  const { user, resetDemo } = useApp();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [armed, setArmed] = useState(false);
  const exp = useAction(downloadExport);
  const del = useAction(async () => { await deleteAccount(email, pw); router.replace("/"); });
  const reset = useAction(async () => { await resetDemo(); }, "Demo data restored.");
  return (
    <>
      <title>Your data · FinMate AI</title>
      <div className="setting">
        <div><h2>Export your expenses</h2><p>A CSV of every expense you&apos;ve recorded, ready for a spreadsheet.</p></div>
        <div className="formcard">
          {exp.error && <Notice tone="bad">{exp.error}</Notice>}
          <div><button className="btn" disabled={exp.busy} onClick={() => void exp.run()}>{exp.busy ? "Preparing…" : "Download CSV"}</button></div>
        </div>
      </div>

      {user.role === "admin" && (
        <div className="setting">
          <div><h2>Demo data</h2><p>Development tool. Restores the sample Sharma household and signs out accounts created since.</p></div>
          <div className="formcard">
            {reset.error && <Notice tone="bad">{reset.error}</Notice>}
            <div>
              <ConfirmDialog
                title="Reset all demo data?"
                description="Every account and expense created since will be erased and the sample Sharma household restored. This cannot be undone."
                confirmLabel="Reset everything"
                onConfirm={() => void reset.run()}
                trigger={<button className="btn" disabled={reset.busy}>Reset demo data</button>}
              />
            </div>
          </div>
        </div>
      )}

      <div className="setting">
        <div><h2>Delete account</h2><p>Permanently removes your account, expenses, budgets and advice. This cannot be undone.</p></div>
        <div className="danger-zone formcard wide">
          {!armed ? (
            <div><button className="btn outline-danger" onClick={() => setArmed(true)}>Delete my account…</button></div>
          ) : (
            <form className="formcard" onSubmit={(e) => { e.preventDefault(); void del.run(); }}>
              <Field label={`Type ${user.email} to confirm`}>
                <input required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
              </Field>
              {user.has_password && (
                <Field label="Password"><PasswordInput required autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
              )}
              {del.error && <Notice tone="bad">{del.error}</Notice>}
              <div className="actions" style={{ justifyContent: "flex-start" }}>
                <button className="btn danger" disabled={del.busy}>{del.busy ? "Deleting…" : "Delete everything"}</button>
                <button type="button" className="btn ghost" onClick={() => setArmed(false)}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

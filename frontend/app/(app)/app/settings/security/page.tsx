"use client";
import { useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { Field, Notice, PasswordInput, useAction } from "@/components/ui";
import { changePassword, getMe, signOutEverywhere } from "@/lib/api";

export default function SecuritySettings() {
  const { user, setUser } = useApp();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const mismatch = again.length > 0 && next !== again;
  const change = useAction(async () => {
    await changePassword(cur, next);
    setUser(await getMe());
    setCur(""); setNext(""); setAgain("");
  }, "Password changed. Your other devices were signed out.");
  const everywhere = useAction(async () => { await signOutEverywhere(); }, "Every other session was signed out.");

  return (
    <>
      <title>Security · FinMate AI</title>
      <div className="setting">
        <div>
          <h2>{user.has_password ? "Change password" : "Set a password"}</h2>
          <p>{user.has_password
            ? "Changing it signs out every other device. This browser stays signed in."
            : "You signed up with Google. Add a password to also sign in with your email."}</p>
        </div>
        <form className="formcard" onSubmit={(e) => { e.preventDefault(); if (!mismatch) void change.run(); }}>
          {user.has_password && (
            <Field label="Current password">
              <PasswordInput required autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
            </Field>
          )}
          <Field label="New password" hint="At least 8 characters.">
            <PasswordInput required minLength={8} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="Confirm new password">
            <PasswordInput required autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
          </Field>
          {mismatch && <Notice tone="bad">The two passwords don&apos;t match.</Notice>}
          {change.error && <Notice tone="bad">{change.error}</Notice>}
          <div><button className="btn primary" disabled={change.busy || mismatch}>{change.busy ? "Updating…" : "Update password"}</button></div>
        </form>
      </div>
      <div className="setting">
        <div><h2>Sign out everywhere</h2><p>Use this if you used a shared or public device. You stay signed in here.</p></div>
        <div className="formcard">
          {everywhere.error && <Notice tone="bad">{everywhere.error}</Notice>}
          <div><button className="btn" disabled={everywhere.busy} onClick={() => void everywhere.run()}>Sign out other sessions</button></div>
        </div>
      </div>
    </>
  );
}

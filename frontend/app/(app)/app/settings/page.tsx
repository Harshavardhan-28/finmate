"use client";
import { useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { Field, Notice, useAction } from "@/components/ui";
import { updateProfile } from "@/lib/api";

export default function ProfileSettings() {
  const { user, setUser, refresh } = useApp();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email ?? "");
  const save = useAction(async () => { setUser(await updateProfile(name, email)); await refresh(); }, "Profile saved.");
  const dirty = name !== user.name || email !== (user.email ?? "");
  return (
    <>
      <title>Profile · FinMate AI</title>
      <div className="setting">
        <div><h2>Profile</h2><p>Your name appears to family members. Your email is what you sign in with.</p></div>
        <form className="formcard" onSubmit={(e) => { e.preventDefault(); void save.run(); }}>
          <Field label="Name"><input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
          <Field label="Email"><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
          {save.error && <Notice tone="bad">{save.error}</Notice>}
          <div><button className="btn primary" disabled={save.busy || !dirty}>{save.busy ? "Saving…" : "Save changes"}</button></div>
        </form>
      </div>
      <div className="setting">
        <div><h2>Role and family</h2><p>Set by your family admin.</p></div>
        <dl className="facts">
          <dt>Role</dt><dd>{user.role === "admin" ? "Family admin" : "Family member"}</dd>
          <dt>Sign-in methods</dt>
          <dd>{[user.has_password && "Email and password", user.has_google && "Google"].filter(Boolean).join(" and ") || "None"}</dd>
        </dl>
      </div>
    </>
  );
}

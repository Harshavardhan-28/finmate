"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/app/AppProvider";
import { Meter } from "@/components/app/Parts";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";
import Pick from "@/components/Pick";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field, Notice, PasswordInput, useAction } from "@/components/ui";
import { addMember, listMembers, removeMember, setMemberRole } from "@/lib/api";
import { money } from "@/lib/format";
import type { FamilyMember } from "@/lib/types";

function Members() {
  const { user, dash, refresh } = useApp();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: "", email: "", password: "", role: "member" });
  const load = useCallback(() => listMembers().then(setMembers).catch(() => undefined), []);
  useEffect(() => { void load(); }, [load]);

  const act = useAction(async (fn: () => Promise<FamilyMember[]>, done: string) => { setMembers(await fn()); await refresh(); toast.success(done); });
  const create = useAction(async () => {
    setMembers(await addMember(f));
    setF({ name: "", email: "", password: "", role: "member" });
    setAdding(false);
    await refresh();
    toast.success(`${f.name} was added to your family`);
  });
  const fam = dash && !("error" in dash.family) ? dash.family : null;
  const spent = (id: string) => fam?.members.find((m) => m.user_id === id)?.spent ?? 0;

  return (
    <section className="sect">
      <div className="sect-head"><h2>Members</h2><span className="sect-meta">{members.length} in your family</span></div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Sign-in</TableHead>
            <TableHead className="text-right">This month</TableHead>
            <TableHead className="w-[1%]"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => {
            const me = m.id === user.user_id;
            const methods = [m.has_password && "Password", m.has_google && "Google"].filter(Boolean).join(" · ");
            return (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="font-semibold">{m.name} {me && <Badge variant="secondary">You</Badge>}</div>
                  <div className="text-xs text-muted-foreground">{m.email}</div>
                </TableCell>
                <TableCell className="text-muted-foreground">{methods || "Agent-created, no login"}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{money(spent(m.id))}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <Pick label={`Role for ${m.name}`} className="w-28 data-[size=default]:h-8" value={m.role}
                      onChange={(role) => void act.run(() => setMemberRole(m.id, role), `${m.name} is now ${role === "admin" ? "an admin" : "a member"}`)}
                      options={[{ value: "admin", label: "Admin" }, { value: "member", label: "Member" }]} />
                    {!me && (
                      <ConfirmDialog
                        title={`Remove ${m.name}?`}
                        description={`${m.name}'s login, expenses, budgets and advice will be permanently deleted. This cannot be undone.`}
                        confirmLabel="Remove and delete data"
                        onConfirm={() => void act.run(() => removeMember(m.id), `${m.name} was removed`)}
                        trigger={<button className="btn sm ghost">Remove</button>}
                      />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {act.error && <div style={{ marginTop: 12 }}><Notice tone="bad">{act.error}</Notice></div>}

      <div style={{ marginTop: 18 }}>
        {adding ? (
          <form className="inline-form" onSubmit={(e) => { e.preventDefault(); void create.run(); }}>
            <Field label="Name"><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Email"><input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Temporary password" hint="At least 8 characters. They can change it in Settings.">
              <PasswordInput required minLength={8} autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            </Field>
            <Field label="Role">
              <Pick label="Role" value={f.role} onChange={(role) => setF({ ...f, role })}
                options={[{ value: "member", label: "Member" }, { value: "admin", label: "Admin" }]} />
            </Field>
            <span className="actions">
              <button className="btn primary" disabled={create.busy}>{create.busy ? "Adding…" : "Add member"}</button>
              <button type="button" className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>
            </span>
            {create.error && <div style={{ gridColumn: "1 / -1" }}><Notice tone="bad">{create.error}</Notice></div>}
          </form>
        ) : (
          <button className="btn" onClick={() => setAdding(true)}>Add a member</button>
        )}
      </div>
    </section>
  );
}

export default function FamilyPage() {
  const { user, dash } = useApp();
  if (!dash) return <div className="page"><p className="muted">Loading…</p></div>;
  const fam = dash.family;
  const restricted = "error" in fam;
  return (
    <>
      <title>Family · FinMate AI</title>
      <div className="page">
        <header className="page-head">
          <div>
            <p className="eyebrow">{restricted ? "Your household" : "Household"}</p>
            <h1>Family</h1>
            <p>{restricted
              ? "Only the family admin can see everyone's spending. You can see your own expenses and the shared family budgets."
              : "Combined spending, who is over a limit, and who can sign in. Only admins see this page in full."}</p>
          </div>
        </header>

        {restricted ? (
          <section className="sect">
            <div className="sect-head"><h2>Shared family budgets</h2><span className="sect-meta">view only</span></div>
            <Meter rows={dash.budgets.family} warn={dash.budgets.warn_pct} empty="No family budgets yet." />
            <p className="muted" style={{ marginTop: 16 }}>
              Signed in as {user.name} (member). Ask your family admin if you need a role change. Manage your own budgets{" "}
              <Link href="/app/budgets" className="textlink">here</Link>.
            </p>
          </section>
        ) : (
          <>
            <div className="kpis two">
              <div className="kpi"><span className="kpi-label">Household spend this month</span><span className="kpi-value">{money(fam.household_total)}</span><span className="kpi-sub">{fam.members.length} members</span></div>
              <div className="kpi">
                <span className="kpi-label">Top spender</span>
                <span className="kpi-value">{[...fam.members].sort((a, b) => b.spent - a.spent)[0]?.name ?? "—"}</span>
                <span className="kpi-sub">{money([...fam.members].sort((a, b) => b.spent - a.spent)[0]?.spent ?? 0)}</span>
              </div>
            </div>
            <div className="split">
              <section className="sect">
                <div className="sect-head"><h2>Family budgets</h2><Link className="sect-link" href="/app/budgets">Edit</Link></div>
                <Meter rows={fam.family_budgets} warn={dash.budgets.warn_pct} empty="No family budgets yet." />
              </section>
              <section className="sect">
                <div className="sect-head"><h2>Member alerts</h2></div>
                {fam.recent_alerts.length ? fam.recent_alerts.slice(0, 5).map((a, i) => (
                  <div key={i} className={`alert ${a.level}`}><b>{a.user}</b><span>{a.message}</span></div>
                )) : <p className="muted">No member has crossed a limit.</p>}
              </section>
            </div>
            <Members />
          </>
        )}
      </div>
    </>
  );
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import AgentTape from "@/components/AgentTape";
import Chat, { type Msg } from "@/components/Chat";
import DashboardView from "@/components/Dashboard";
import { getDashboard, getHealth, getUsers, resetDemo, streamPost, upload } from "@/lib/api";
import { sampleReceipt } from "@/lib/sample";
import type { Dashboard, Proposal, StreamEvent, TraceItem, User } from "@/lib/types";
import { inr } from "@/lib/format";

type Tab = "chat" | "dash" | "agents";
type NewMsg = Msg extends infer M ? (M extends { id: number } ? Omit<M, "id"> : never) : never;

export default function Home() {
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState("u_ravi");
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [trace, setTrace] = useState<TraceItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("chat");
  const [health, setHealth] = useState<{ llm_configured: boolean; model: string } | null>(null);
  const [offline, setOffline] = useState(false);
  const ids = useRef({ msg: 1, trace: 1, turn: 0 });

  const refresh = useCallback(async (uid: string) => {
    try {
      setDash(await getDashboard(uid));
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    getUsers().then(setUsers).catch(() => setOffline(true));
    getHealth().then(setHealth).catch(() => setOffline(true));
  }, []);
  useEffect(() => {
    let live = true;
    getDashboard(userId)
      .then((d) => { if (live) { setDash(d); setOffline(false); } })
      .catch(() => { if (live) setOffline(true); });
    return () => { live = false; };
  }, [userId]);

  const add = (m: NewMsg) =>
    setMessages((prev) => [...prev, { ...m, id: ids.current.msg++ } as Msg]);

  async function run(path: string, body: Record<string, unknown>) {
    setBusy(true);
    const turn = ++ids.current.turn;
    const handle = (e: StreamEvent) => {
      if (e.type === "trace") {
        const { type: _t, ...rest } = e;
        void _t;
        setTrace((prev) => [...prev.slice(-250), { ...rest, id: ids.current.trace++, turn }]);
      } else if (e.type === "proposal") add({ role: "proposal", proposal: e.proposal, state: "pending" });
      else if (e.type === "saved") refresh(userId);
      else if (e.type === "final") add({ role: "assistant", text: e.text });
      else if (e.type === "error") add({ role: "error", text: e.message });
    };
    try {
      await streamPost(path, { user_id: userId, ...body }, handle);
    } catch (err) {
      add({ role: "error", text: err instanceof Error ? err.message : "Could not reach the FinMate backend." });
    } finally {
      setBusy(false);
      refresh(userId);
    }
  }

  const send = (text: string) => {
    add({ role: "user", text });
    run("/api/chat", { message: text });
  };

  async function sendFile(kind: "receipt" | "voice", blob: Blob, filename: string) {
    add({
      role: "user",
      text: kind === "voice" ? "Voice note" : "Receipt",
      image: kind === "receipt" ? URL.createObjectURL(blob) : undefined,
    });
    try {
      const { attachment_id } = await upload(blob, filename, kind);
      await run("/api/chat", { attachment_id, kind, message: "" });
    } catch (err) {
      add({ role: "error", text: err instanceof Error ? err.message : "Upload failed." });
    }
  }

  const sample = async () => sendFile("receipt", await sampleReceipt(), "sample-uber-receipt.png");

  const openForm = () =>
    add({
      role: "proposal", state: "pending",
      proposal: { amount: 0, date: new Date().toISOString().slice(0, 10), merchant: "", category: "Food", source: "form", note: "", unclear_fields: [] },
    });

  function confirm(id: number, p: Proposal) {
    setMessages((prev) => prev.map((m) => (m.id === id && m.role === "proposal" ? { ...m, state: "done" } : m)));
    add({ role: "user", text: `Confirmed: ${inr(p.amount)} · ${p.merchant} · ${p.category}` });
    run("/api/confirm", { amount: p.amount, date: p.date, merchant: p.merchant, category: p.category, source: p.source, note: p.note });
  }

  const discard = (id: number) =>
    setMessages((prev) => prev.map((m) => (m.id === id && m.role === "proposal" ? { ...m, state: "discarded" } : m)));

  const clearAll = () => { setMessages([]); setTrace([]); ids.current.turn = 0; };

  function switchUser(id: string) {
    if (id === userId || busy) return;
    clearAll();
    setUserId(id);
  }

  async function reset() {
    if (busy) return;
    await resetDemo().catch(() => undefined);
    clearAll();
    refresh(userId);
  }

  const current = users.find((u) => u.id === userId);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Fin<span>Mate</span> AI</div>
        <div className="tagline">One orchestrator, four agents, one shared memory</div>
        <div className="spacer" />
        {offline ? (
          <span className="chip bad">Backend offline</span>
        ) : health && !health.llm_configured ? (
          <span className="chip warn">No Gemini key</span>
        ) : health ? (
          <span className="chip">{health.model}</span>
        ) : null}
        <div className="userswitch" role="group" aria-label="Signed-in user">
          {users.map((u) => (
            <button key={u.id} aria-pressed={u.id === userId} onClick={() => switchUser(u.id)}>
              {u.name}<small>{u.role}</small>
            </button>
          ))}
        </div>
        <button className="btn ghost" onClick={reset} disabled={busy}>Reset demo</button>
      </header>

      <nav className="tabs" role="tablist">
        {([["chat", "Chat"], ["dash", "Dashboard"], ["agents", "Agents"]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>

      <main className="cols">
        <section className="col" data-active={tab === "chat"} style={{ overflow: "hidden" }}>
          <Chat messages={messages} busy={busy} userName={current?.name ?? ""}
            onSend={send} onFile={sendFile} onSample={sample} onForm={openForm}
            onConfirm={confirm} onDiscard={discard} />
        </section>
        <section className="col" data-active={tab === "dash"}>
          <DashboardView data={dash} />
        </section>
        <section className="col" data-active={tab === "agents"}>
          <AgentTape trace={trace} busy={busy} />
        </section>
      </main>
    </div>
  );
}

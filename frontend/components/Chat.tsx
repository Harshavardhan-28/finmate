"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import Pick from "@/components/Pick";
import { money } from "@/lib/format";
import { useVoiceRecorder } from "@/lib/useVoiceRecorder";
import { CATEGORIES, type BillProposal, type Proposal, type SttStatus } from "@/lib/types";

export type Msg =
  | { id: number; role: "user" | "assistant" | "error"; text: string; image?: string; voice?: boolean }
  | { id: number; role: "proposal"; proposal: Proposal; state: "pending" | "done" | "discarded" }
  | { id: number; role: "bill"; bill: BillProposal; state: "pending" | "done" | "discarded" };

const PROMPTS = ["How are my budgets?", "Where can I save money?", "Show my family's spending"];

/** Minimal markdown: **bold** and "* " bullets, enough for agent replies. */
export function Rich({ text }: { text: string }) {
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
      p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>,
    );
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(<ul key={`u${blocks.length}`}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
      list = [];
    }
  };
  text.split("\n").forEach((line) => {
    const m = line.match(/^\s*[*-]\s+(.*)/);
    if (m) list.push(m[1]);
    else {
      flush();
      if (line.trim()) blocks.push(<p key={`p${blocks.length}`}>{inline(line)}</p>);
    }
  });
  flush();
  return <>{blocks}</>;
}

export function ConfirmCard({
  msg, onConfirm, onDiscard, disabled,
}: {
  msg: Extract<Msg, { role: "proposal" }>;
  onConfirm: (p: Proposal) => void;
  onDiscard: () => void;
  disabled: boolean;
}) {
  const [p, setP] = useState<Proposal>(msg.proposal);
  const set = <K extends keyof Proposal>(k: K, v: Proposal[K]) => setP((x) => ({ ...x, [k]: v }));
  const unclear = (f: string) => (p.unclear_fields.includes(f) ? "unclear" : "");
  const locked = msg.state !== "pending";
  const valid = p.amount > 0 && p.merchant.trim() !== "";
  return (
    <div className="confirm" style={locked ? { opacity: 0.6 } : undefined}>
      <h3>
        {p.source === "form" ? "New expense" : "Confirm this expense"}
        {msg.state === "done" && <span className="chip">Saved</span>}
        {msg.state === "discarded" && <span className="chip warn">Discarded</span>}
      </h3>
      <div className="sub">
        {p.source === "form" ? "Fill in the details." : `Read from your ${p.source}. Fix anything that is off before saving.`}
      </div>
      <div className="fields">
        <label className={`field ${unclear("amount")}`}>Amount
          <input type="number" min="0" disabled={locked} value={p.amount || ""} onChange={(e) => set("amount", Number(e.target.value))} />
        </label>
        <label className={`field ${unclear("date")}`}>Date
          <input type="date" disabled={locked} value={p.date} onChange={(e) => set("date", e.target.value)} />
        </label>
        <label className={`field ${unclear("merchant")}`}>Merchant
          <input type="text" disabled={locked} value={p.merchant} onChange={(e) => set("merchant", e.target.value)} />
        </label>
        <label className={`field ${unclear("category")}`}>Category
          <select disabled={locked} value={p.category} onChange={(e) => set("category", e.target.value)}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className={`field wide ${unclear("note")}`}>Note
          <input type="text" disabled={locked} value={p.note} onChange={(e) => set("note", e.target.value)} placeholder="e.g. Home to Office" />
        </label>
      </div>
      {!locked && (
        <div className="confirm-actions">
          <button className="btn primary" disabled={disabled || !valid} onClick={() => onConfirm(p)}>Confirm and save</button>
          <button className="btn" disabled={disabled} onClick={onDiscard}>Discard</button>
        </div>
      )}
    </div>
  );
}

type Line = { name: string; category: string; amount: string; quantity: number | null; unit_price: number | null };

/** Review a scanned bill: every line item with its own category, saved together as one bill. */
export function BillCard({
  msg, onConfirm, onDiscard, disabled,
}: {
  msg: Extract<Msg, { role: "bill" }>;
  onConfirm: (b: BillProposal) => void;
  onDiscard: () => void;
  disabled: boolean;
}) {
  const [b, setB] = useState<BillProposal>(msg.bill);
  const [rows, setRows] = useState<Line[]>(() => msg.bill.items.map((i) => ({ ...i, amount: String(i.amount) })));
  const locked = msg.state !== "pending";
  const total = Math.round(rows.reduce((s, r) => s + (Number(r.amount) > 0 ? Number(r.amount) : 0), 0) * 100) / 100;
  const patch = (n: number, p: Partial<Line>) => setRows((rs) => rs.map((r, i) => (i === n ? { ...r, ...p } : r)));
  const unclear = (f: string) => (b.unclear_fields.includes(f) ? "unclear" : "");
  const valid = b.merchant.trim() !== "" && /^\d{4}-\d{2}-\d{2}$/.test(b.date) && rows.length > 0
    && rows.every((r) => r.name.trim() && Number(r.amount) > 0);
  const mismatch = Math.abs(b.total - total) > 1;
  const submit = () => onConfirm({ ...b, total, items: rows.map((r) => ({ name: r.name.trim(), quantity: r.quantity, unit_price: r.unit_price, amount: Number(r.amount), category: r.category })) });
  return (
    <div className="confirm" style={locked ? { opacity: 0.6 } : undefined}>
      <h3>
        Review this bill
        {msg.state === "done" && <span className="chip">Saved</span>}
        {msg.state === "discarded" && <span className="chip warn">Discarded</span>}
      </h3>
      <div className="sub">
        {rows.length} {rows.length === 1 ? "item" : "items"} read from your bill{b.bill_number ? ` (no. ${b.bill_number})` : ""}. Fix anything that is off before saving.
      </div>
      <div className="fields">
        <label className={`field ${unclear("merchant")}`}>Merchant
          <input type="text" disabled={locked} value={b.merchant} onChange={(e) => setB({ ...b, merchant: e.target.value })} />
        </label>
        <label className={`field ${unclear("date")}`}>Date
          <input type="date" disabled={locked} value={b.date} onChange={(e) => setB({ ...b, date: e.target.value })} />
        </label>
      </div>
      <div className="bill-grid" role="group" aria-label="Bill items" style={{ marginTop: 12 }}>
        <div className="bill-row head" aria-hidden><span>Item</span><span>Category</span><span className="r">Amount</span><span /></div>
        {rows.map((r, i) => (
          <div className="bill-row" key={i}>
            <input className="b-name" aria-label={`Item ${i + 1} name`} disabled={locked} value={r.name} onChange={(e) => patch(i, { name: e.target.value })} />
            <Pick className="b-cat" label={`Item ${i + 1} category`} value={r.category} onChange={(category) => patch(i, { category })}
              options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
            <input aria-label={`Item ${i + 1} amount`} className="b-amt r" type="number" min="0.01" step="0.01" disabled={locked}
              value={r.amount} onChange={(e) => patch(i, { amount: e.target.value })} />
            <button type="button" className="rowx" aria-label={`Remove item ${i + 1}`} disabled={locked || rows.length === 1}
              onClick={() => setRows((rs) => rs.filter((_, n) => n !== i))}>×</button>
          </div>
        ))}
      </div>
      <div className="billform-foot">
        {!locked && <button type="button" className="btn sm" onClick={() => setRows((rs) => [...rs, { name: "", category: "Other", amount: "", quantity: null, unit_price: null }])}>+ Add item</button>}
        <span className="bill-total">Total <b>{money(total)}</b></span>
      </div>
      {mismatch && !locked && <p className="muted" style={{ marginTop: 8 }}>The bill says {money(b.total)}, but these items add up to {money(total)}. Check the amounts.</p>}
      {(b.tax_fees > 0 || b.discount > 0) && <p className="muted" style={{ marginTop: 8 }}>
        {b.tax_fees > 0 ? `Includes ${money(b.tax_fees)} taxes, fees and rounding. ` : ""}{b.discount > 0 ? `Item prices were adjusted for a ${money(b.discount)} discount.` : ""}
      </p>}
      {!locked && (
        <div className="confirm-actions">
          <button className="btn primary" disabled={disabled || !valid} onClick={submit}>Save bill · {money(total)}</button>
          <button className="btn" disabled={disabled} onClick={onDiscard}>Discard</button>
        </div>
      )}
    </div>
  );
}

export default function Chat(props: {
  messages: Msg[];
  busy: boolean;
  userName: string;
  onSend: (text: string) => void;
  /** Called with a finished recording; the page turns it into text and sends it. */
  onVoice: (audio: Blob) => void;
  listening: boolean;
  /** Speech-to-text engine status from /api/health, so the mic can say where audio goes. */
  voice?: SttStatus;
  onConfirm: (id: number, p: Proposal) => void;
  onConfirmBill: (id: number, b: BillProposal) => void;
  onDiscard: (id: number) => void;
}) {
  const { messages, busy } = props;
  const [text, setText] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const { recording, error: micError, toggle: toggleMic } = useVoiceRecorder((wav) => props.onVoice(wav));
  const micOff = !recording && (busy || props.listening || props.voice?.ready === false);
  const micHint = props.voice?.ready === false ? props.voice.problem ?? "Voice input is not available" : "";

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);

  const send = (t = text) => {
    if (!t.trim() || busy) return;
    props.onSend(t.trim());
    setText("");
  };

  return (
    <div className="chat">
      <div className="chat-log" ref={logRef}>
        {messages.length === 0 && (
          <div className="empty">
            <h3>Hi {props.userName}, what did you spend?</h3>
            Type &quot;spent 450 on cab&quot;, or ask about your budgets, your family&apos;s spending, or where you can save.
            The Orchestrator hands the work to its four agents. To log a receipt, a voice note or a bill, use{" "}
            <a href="/app/receipts" className="textlink">Receipts</a>.
          </div>
        )}
        {messages.map((m) =>
          m.role === "proposal" ? (
            <ConfirmCard key={m.id} msg={m} disabled={busy}
              onConfirm={(p) => props.onConfirm(m.id, p)} onDiscard={() => props.onDiscard(m.id)} />
          ) : m.role === "bill" ? (
            <BillCard key={m.id} msg={m} disabled={busy}
              onConfirm={(b) => props.onConfirmBill(m.id, b)} onDiscard={() => props.onDiscard(m.id)} />
          ) : (
            <div key={m.id} className={`msg ${m.role}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {m.image && <img src={m.image} alt="Uploaded receipt" />}
              {m.voice && <Mic size={12} className="spoken" aria-label="Spoken" />}
              <Rich text={m.text} />
            </div>
          ),
        )}
        {busy && <div className="thinking"><i /><i /><i /> agents working</div>}
      </div>

      {messages.length === 0 && (
        <div className="prompts">
          {PROMPTS.map((p) => <button key={p} onClick={() => send(p)} disabled={busy}>{p}</button>)}
        </div>
      )}

      <div className="composer">
        <form className="composer-row" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input type="text" value={text} onChange={(e) => setText(e.target.value)} disabled={busy || recording}
            placeholder={recording ? "Listening…" : "Message FinMate or tap the mic…"} aria-label="Message" />
          <button type="button" className={`mic ${recording ? "rec" : ""}`} onClick={() => void toggleMic()} disabled={micOff}
            aria-pressed={recording} aria-label={recording ? "Stop recording" : "Speak to the assistant"}
            title={micHint || (recording ? "Tap to stop and send" : "Speak to the assistant")}>
            {recording ? <Square size={16} fill="currentColor" /> : <Mic size={18} />}
          </button>
          <button className="btn primary" type="submit" disabled={busy || recording || !text.trim()}>Send</button>
        </form>
        <div className="voice-status" role="status" aria-live="polite">
          {recording ? "Listening… tap the square when you are done."
            : props.listening ? "Turning your voice into text…"
            : micError ? <span className="err">{micError}</span>
            : micHint ? <span className="err">{micHint}</span>
            : props.voice?.cloud ? `Voice is transcribed by ${props.voice.provider === "groq" ? "Groq" : "a cloud service"}; the audio leaves this device.`
            : ""}
        </div>
      </div>
    </div>
  );
}

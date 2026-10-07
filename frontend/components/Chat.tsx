"use client";
import { useEffect, useRef, useState } from "react";
import { CATEGORIES, type Proposal } from "@/lib/types";
import { blobToWav } from "@/lib/audio";

export type Msg =
  | { id: number; role: "user" | "assistant" | "error"; text: string; image?: string }
  | { id: number; role: "proposal"; proposal: Proposal; state: "pending" | "done" | "discarded" };

const PROMPTS = ["How are my budgets?", "Where can I save money?", "Show my family's spending"];

/** Minimal markdown: **bold** and "* " bullets, enough for agent replies. */
function Rich({ text }: { text: string }) {
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

function ConfirmCard({
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
        <label className={`field ${unclear("amount")}`}>Amount (₹)
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

export default function Chat(props: {
  messages: Msg[];
  busy: boolean;
  userName: string;
  onSend: (text: string) => void;
  onFile: (kind: "receipt" | "voice", blob: Blob, filename: string) => void;
  onSample: () => void;
  onForm: () => void;
  onConfirm: (id: number, p: Proposal) => void;
  onDiscard: (id: number) => void;
}) {
  const { messages, busy } = props;
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [micError, setMicError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);

  const send = (t = text) => {
    if (!t.trim() || busy) return;
    props.onSend(t.trim());
    setText("");
  };

  async function toggleMic() {
    setMicError("");
    if (recording) {
      recorder.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => chunks.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        try {
          const wav = await blobToWav(new Blob(chunks.current, { type: rec.mimeType }));
          props.onFile("voice", wav, "voice-note.wav");
        } catch {
          setMicError("Could not read the recording. Try again or upload a WAV/MP3 file.");
        }
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
    } catch {
      setMicError("Microphone blocked. Allow mic access in the browser, or upload an audio file.");
    }
  }

  function picked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    props.onFile(f.type.startsWith("audio/") ? "voice" : "receipt", f, f.name);
  }

  return (
    <div className="chat">
      <div className="chat-log" ref={logRef}>
        {messages.length === 0 && (
          <div className="empty">
            <h3>Hi {props.userName}, what did you spend?</h3>
            Snap a receipt, record a voice note, type &quot;spent 450 on cab&quot;, or ask about your budgets.
            The Orchestrator hands the work to its four agents.
          </div>
        )}
        {messages.map((m) =>
          m.role === "proposal" ? (
            <ConfirmCard key={m.id} msg={m} disabled={busy}
              onConfirm={(p) => props.onConfirm(m.id, p)} onDiscard={() => props.onDiscard(m.id)} />
          ) : (
            <div key={m.id} className={`msg ${m.role}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {m.image && <img src={m.image} alt="Uploaded receipt" />}
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
        <div className="tools">
          <button className="tool" onClick={() => fileRef.current?.click()} disabled={busy}>Upload receipt</button>
          <button className={`tool ${recording ? "rec" : ""}`} onClick={toggleMic} disabled={busy && !recording}>
            {recording ? "Stop recording" : "Voice note"}
          </button>
          <button className="tool" onClick={props.onSample} disabled={busy}>Try sample receipt</button>
          <button className="tool" onClick={props.onForm} disabled={busy}>Add by form</button>
          <input ref={fileRef} type="file" accept="image/*,audio/*" hidden onChange={picked} />
        </div>
        {micError && <div className="muted" style={{ color: "var(--red)" }}>{micError}</div>}
        <form className="composer-row" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input type="text" value={text} onChange={(e) => setText(e.target.value)} disabled={busy}
            placeholder="Message FinMate…" aria-label="Message" />
          <button className="btn primary" type="submit" disabled={busy || !text.trim()}>Send</button>
        </form>
      </div>
    </div>
  );
}

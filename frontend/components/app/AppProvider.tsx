"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Msg } from "@/components/Chat";
import {
  getDashboard, getExpenses, getHealth, getMe, logout as apiLogout, resetDemo, streamPost, upload,
} from "@/lib/api";
import { setCurrency } from "@/lib/format";
import { toast } from "sonner";
import { sampleReceipt } from "@/lib/sample";
import type { AuthUser, BillProposal, Dashboard, Expense, Proposal, StreamEvent, TraceItem } from "@/lib/types";
import { money } from "@/lib/format";

type NewMsg = Msg extends infer M ? (M extends { id: number } ? Omit<M, "id"> : never) : never;
type Lane = "chat" | "capture";
type Health = { llm_configured: boolean; model: string };

type Ctx = {
  user: AuthUser;
  setUser: (u: AuthUser) => void;
  dash: Dashboard | null;
  expenses: Expense[];
  offline: boolean;
  health: Health | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  resetDemo: () => Promise<void>;
  /** Typed conversation with the assistant. */
  chat: {
    messages: Msg[]; trace: TraceItem[]; busy: boolean;
    send: (text: string) => void;
    confirm: (id: number, p: Proposal) => void;
    confirmBill: (id: number, b: BillProposal) => void;
    discard: (id: number) => void;
  };
  /** Receipt photos and voice notes, kept apart from the chat. */
  capture: {
    messages: Msg[]; busy: boolean;
    sendFile: (kind: "receipt" | "voice", blob: Blob, filename: string) => Promise<void>;
    sample: () => Promise<void>;
    confirm: (id: number, p: Proposal) => void;
    confirmBill: (id: number, b: BillProposal) => void;
    discard: (id: number) => void;
    clear: () => void;
  };
};

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp must be used inside <AppProvider>");
  return c;
};

/** Gate for everything under /app: loads the session, then keeps dashboard, expenses and chat state alive across pages. */
export default function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => router.replace(`/login?next=${encodeURIComponent(pathname)}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return <div className="boot" aria-busy="true">Loading…</div>;
  return <Session user={user} setUser={setUser}>{children}</Session>;
}

function Session({ user, setUser, children }: { user: AuthUser; setUser: (u: AuthUser) => void; children: React.ReactNode }) {
  const router = useRouter();
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [lanes, setLanes] = useState<Record<Lane, Msg[]>>({ chat: [], capture: [] });
  const [trace, setTrace] = useState<TraceItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [offline, setOffline] = useState(false);
  const ids = useRef({ msg: 1, trace: 1, turn: 0 });

  setCurrency(user.currency);

  const refresh = useCallback(async () => {
    try {
      const [d, e] = await Promise.all([getDashboard(), getExpenses(90)]);
      setDash(d);
      setExpenses(e);
      setOffline(false);
    } catch (err) {
      if (err instanceof Error && /not authenticated|signed out|invalid or expired/i.test(err.message)) {
        router.replace("/login");
      } else setOffline(true);
    }
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    getHealth().then(setHealth).catch(() => setOffline(true));
  }, [refresh]);

  const add = (lane: Lane, m: NewMsg) =>
    setLanes((prev) => ({ ...prev, [lane]: [...prev[lane], { ...m, id: ids.current.msg++ } as Msg] }));
  const setProposalState = (id: number, state: "done" | "discarded") => {
    const mark = (list: Msg[]) => list.map((m) => (m.id === id && (m.role === "proposal" || m.role === "bill") ? { ...m, state } : m));
    setLanes((prev) => ({ chat: mark(prev.chat), capture: mark(prev.capture) }));
  };
  const laneOf = (id: number): Lane => (lanes.capture.some((m) => m.id === id) ? "capture" : "chat");

  async function run(lane: Lane, path: string, body: Record<string, unknown>) {
    setBusy(true);
    const turn = ++ids.current.turn;
    const handle = (e: StreamEvent) => {
      if (e.type === "trace") {
        const { type: _t, ...rest } = e;
        void _t;
        setTrace((prev) => [...prev.slice(-250), { ...rest, id: ids.current.trace++, turn }]);
      } else if (e.type === "proposal") add(lane, { role: "proposal", proposal: e.proposal, state: "pending" });
      else if (e.type === "bill_proposal") add(lane, { role: "bill", bill: e.bill, state: "pending" });
      else if (e.type === "bill_saved") {
        void refresh();
        toast.success(`Saved ${e.bill.merchant} · ${money(e.bill.total)} · ${e.bill.items.length} ${e.bill.items.length === 1 ? "item" : "items"}`);
        e.alerts.forEach((a) => (a.level === "exceeded" ? toast.error(a.message) : toast.warning(a.message)));
      }
      else if (e.type === "saved") {
        void refresh();
        toast.success(`Saved ${e.expense.merchant} · ${money(e.expense.amount)}`);
        e.alerts.forEach((a) => (a.level === "exceeded" ? toast.error(a.message) : toast.warning(a.message)));
      }
      else if (e.type === "final") add(lane, { role: "assistant", text: e.text });
      else if (e.type === "error") add(lane, { role: "error", text: e.message });
    };
    try {
      await streamPost(path, body, handle);
    } catch (err) {
      add(lane, { role: "error", text: err instanceof Error ? err.message : "Could not reach the FinMate backend." });
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  const send = (text: string) => {
    add("chat", { role: "user", text });
    void run("chat", "/api/chat", { message: text });
  };

  const confirm = (id: number, p: Proposal) => {
    const lane = laneOf(id);
    setProposalState(id, "done");
    add(lane, { role: "user", text: `Confirmed: ${money(p.amount)} · ${p.merchant} · ${p.category}` });
    void run(lane, "/api/confirm", { amount: p.amount, date: p.date, merchant: p.merchant, category: p.category, source: p.source, note: p.note });
  };

  const confirmBill = (id: number, b: BillProposal) => {
    const lane = laneOf(id);
    setProposalState(id, "done");
    add(lane, { role: "user", text: `Confirmed bill: ${b.merchant} · ${money(b.total)} · ${b.items.length} ${b.items.length === 1 ? "item" : "items"}` });
    void run(lane, "/api/confirm_bill", { ...b });
  };

  async function sendFile(kind: "receipt" | "voice", blob: Blob, filename: string) {
    setLanes((prev) => ({ ...prev, capture: [] })); // each capture starts a fresh review
    add("capture", {
      role: "user",
      text: kind === "voice" ? "Voice note" : "Receipt",
      image: kind === "receipt" ? URL.createObjectURL(blob) : undefined,
    });
    try {
      const { attachment_id } = await upload(blob, filename, kind);
      await run("capture", "/api/chat", { attachment_id, kind, message: "" });
    } catch (err) {
      add("capture", { role: "error", text: err instanceof Error ? err.message : "Upload failed." });
    }
  }

  const value: Ctx = {
    user, setUser, dash, expenses, offline, health, refresh,
    logout: async () => { await apiLogout().catch(() => undefined); router.replace("/login"); },
    resetDemo: async () => {
      await resetDemo();
      setLanes({ chat: [], capture: [] }); setTrace([]); ids.current.turn = 0;
      await refresh();
    },
    chat: {
      messages: lanes.chat, trace, busy, send, confirm, confirmBill,
      discard: (id) => setProposalState(id, "discarded"),
    },
    capture: {
      messages: lanes.capture, busy, sendFile, confirm, confirmBill,
      sample: async () => sendFile("receipt", await sampleReceipt(), "sample-uber-receipt.png"),
      discard: (id) => setProposalState(id, "discarded"),
      clear: () => setLanes((prev) => ({ ...prev, capture: [] })),
    },
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

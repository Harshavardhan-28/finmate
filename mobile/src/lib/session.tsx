import { router } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import * as api from "./api";
import { money, setCurrency } from "./format";
import type { Alert, AuthUser, BillProposal, Dashboard, Expense, Proposal, StreamEvent } from "./types";

export type Msg =
  | { id: number; role: "user" | "assistant" | "error"; text: string }
  | { id: number; role: "proposal"; proposal: Proposal; state: "pending" | "done" | "discarded" };
type NewMsg = Msg extends infer M ? (M extends { id: number } ? Omit<M, "id"> : never) : never;
export type Toast = { id: number; text: string; tone: "ok" | "warn" | "bad" };

type Ctx = {
  user: AuthUser; setUser: (u: AuthUser) => void;
  dash: Dashboard | null; expenses: Expense[]; offline: boolean; refresh: () => Promise<void>;
  logout: () => Promise<void>;
  messages: Msg[]; busy: boolean; send: (text: string) => void;
  proposal: Proposal | null; clearProposal: () => void; capturing: boolean;
  bill: BillProposal | null; clearBill: () => void; confirmBill: (b: BillProposal) => Promise<Alert[]>;
  capture: (uri: string, name: string, mime: string, kind: "receipt" | "voice") => Promise<void>;
  confirm: (p: Proposal) => Promise<Alert[]>;
  toast: Toast | null;
  approve: (id: number) => void; discard: (id: number) => void;
};
const SessionCtx = createContext<Ctx>(null as never);
export const useSession = () => useContext(SessionCtx);

/** Boots the stored token. Renders children only when signed in; sends the rest to onboarding. */
export function SessionGate({ children }: { children: (user: AuthUser, setUser: (u: AuthUser) => void) => React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  useEffect(() => {
    (async () => {
      await api.loadToken();
      if (!api.hasToken()) return setUser(null);
      api.getMe().then(setUser).catch(() => { void api.setToken(null); setUser(null); });
    })();
  }, []);
  useEffect(() => { if (user === null) router.replace("/onboarding"); }, [user]);
  if (!user) return null;
  return <>{children(user, setUser)}</>;
}

export function SessionProvider({ user, setUser, children }: { user: AuthUser; setUser: (u: AuthUser) => void; children: React.ReactNode }) {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [offline, setOffline] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [bill, setBill] = useState<BillProposal | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const id = useRef(1);
  setCurrency(user.currency);

  const refresh = useCallback(async () => {
    try {
      const [d, e] = await Promise.all([api.getDashboard(), api.getExpenses(90)]);
      setDash(d); setExpenses(e); setOffline(false);
    } catch (err) {
      if (err instanceof Error && /not authenticated|signed out|invalid or expired/i.test(err.message)) {
        await api.setToken(null); router.replace("/onboarding");
      } else setOffline(true);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const say = (text: string, tone: Toast["tone"]) => {
    const t = { id: id.current++, text, tone };
    setToast(t);
    setTimeout(() => setToast((cur) => (cur?.id === t.id ? null : cur)), 3500);
  };
  const add = (m: NewMsg) => setMessages((p) => [...p, { ...m, id: id.current++ } as Msg]);

  async function run(path: string, body: Record<string, unknown>, onProposal?: (p: Proposal) => void, onBill?: (b: BillProposal) => void) {
    setBusy(true);
    const handle = (e: StreamEvent) => {
      if (e.type === "proposal") onProposal ? onProposal(e.proposal) : add({ role: "proposal", proposal: e.proposal, state: "pending" });
      else if (e.type === "bill_proposal") onBill?.(e.bill);
      else if (e.type === "bill_saved") {
        say(`Saved ${e.bill.merchant} · ${money(e.bill.total)} · ${e.bill.items.length} item${e.bill.items.length === 1 ? "" : "s"}`, "ok");
        const worst = e.alerts.find((a) => a.level === "exceeded") ?? e.alerts[0];
        if (worst) say(worst.message, worst.level === "exceeded" ? "bad" : "warn");
      } else if (e.type === "saved") {
        say(`Saved ${e.expense.merchant} · ${money(e.expense.amount)}`, "ok");
        const worst = e.alerts.find((a) => a.level === "exceeded") ?? e.alerts[0];
        if (worst) say(worst.message, worst.level === "exceeded" ? "bad" : "warn");
      } else if (e.type === "final") add({ role: "assistant", text: e.text });
      else if (e.type === "error") add({ role: "error", text: e.message });
    };
    try { await api.streamPost(path, body, handle); }
    catch (err) { add({ role: "error", text: err instanceof Error ? err.message : "Could not reach FinMate." }); }
    finally { setBusy(false); void refresh(); }
  }

  const value: Ctx = {
    user, setUser, dash, expenses, offline, refresh, messages, busy, proposal, capturing, toast, bill,
    logout: async () => { await api.logout(); router.replace("/onboarding"); },
    send: (text) => { add({ role: "user", text }); void run("/api/chat", { message: text }); },
    clearProposal: () => setProposal(null),
    clearBill: () => setBill(null),
    capture: async (uri, name, mime, kind) => {
      setCapturing(true); setProposal(null); setBill(null);
      try {
        const { attachment_id } = await api.upload(uri, name, mime, kind);
        let got: Proposal | null = null, gotBill: BillProposal | null = null;
        await run("/api/chat", { attachment_id, kind, message: "" }, (p) => { got = p; }, (b) => { gotBill = b; });
        if (gotBill) { setBill(gotBill); router.push("/bill"); }       // a photo is a whole bill with its line items
        else if (got) { setProposal(got); router.push("/confirm"); }   // a voice note is a single expense
        else say("Couldn't read that. Try again or type it in.", "warn");
      } catch (err) { say(err instanceof Error ? err.message : "Upload failed.", "bad"); }
      finally { setCapturing(false); }
    },
    confirm: async (p) => {
      const alerts: Alert[] = [];
      setBusy(true);
      try {
        await api.streamPost("/api/confirm", { amount: p.amount, date: p.date, merchant: p.merchant, category: p.category, source: p.source, note: p.note }, (e) => {
          if (e.type === "saved") { alerts.push(...e.alerts); say(`Saved ${e.expense.merchant} · ${money(e.expense.amount)}`, "ok"); }
          if (e.type === "error") throw new Error(e.message);
        });
      } finally { setBusy(false); void refresh(); }
      return alerts;
    },
    confirmBill: async (b) => {
      const alerts: Alert[] = [];
      setBusy(true);
      try {
        await api.streamPost("/api/confirm_bill", b, (e) => {
          if (e.type === "bill_saved") {
            alerts.push(...e.alerts);
            say(`Saved ${e.bill.merchant} · ${money(e.bill.total)} · ${e.bill.items.length} item${e.bill.items.length === 1 ? "" : "s"}`, "ok");
          }
          if (e.type === "error") throw new Error(e.message);
        });
      } finally { setBusy(false); void refresh(); }
      return alerts;
    },
    approve: (mid) => {
      const m = messages.find((x) => x.id === mid);
      if (!m || m.role !== "proposal") return;
      setMessages((p) => p.map((x) => (x.id === mid ? ({ ...x, state: "done" } as Msg) : x)));
      add({ role: "user", text: `Confirmed: ${money(m.proposal.amount)} · ${m.proposal.merchant}` });
      void run("/api/confirm", { ...m.proposal });
    },
    discard: (mid) => setMessages((p) => p.map((x) => (x.id === mid ? ({ ...x, state: "discarded" } as Msg) : x))),
  };
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export type User = { id: string; name: string; role: "admin" | "member"; family_id: string };
export type AuthUser = {
  user_id: string; name: string; role: "admin" | "member"; family_id: string; email: string | null;
  currency: string; warn_pct: number; has_password: boolean; has_google: boolean;
};
export type FamilyMember = { id: string; name: string; email: string | null; role: "admin" | "member"; has_password: boolean; has_google: boolean };
export type Status = { month: string; warn_pct: number; personal: Budget[]; family: Budget[] };
export type SavedBill = { bill: { id: number; merchant: string; date: string; total: number; items: Expense[] }; alerts: Alert[] };
export type SavedExpense = { expense: Expense; alerts: Alert[] };
export type Level = "ok" | "warning" | "exceeded";
export type Budget = { category: string; limit: number; spent: number; pct: number; level: Level };
export type Expense = {
  id: number; user_id: string; amount: number; date: string; merchant: string;
  category: string; source: string; note: string; bill_id: number | null;
  quantity?: number | null; unit_price?: number | null;
};
export type Alert = { category: string; level: Level; pct: number; message: string; scope: string; created_at: string; user?: string };
export type Proposal = {
  amount: number; date: string; merchant: string; category: string;
  source: string; note: string; unclear_fields: string[];
};
export type BillItem = { name: string; quantity: number | null; unit_price: number | null; amount: number; category: string };
/** A whole bill read from a photo: header plus every line item, reviewed by the user before it is saved. */
export type BillProposal = {
  merchant: string; date: string; total: number; tax_fees: number; discount: number; bill_number: string;
  payment_method: string; note: string; items: BillItem[]; unclear_fields: string[]; source: string;
  attachment_id?: string | null; draft_id?: string;
};
export type BillRecord = { id: number; merchant: string; date: string; total: number; items: Expense[] };
export type Member = { user_id: string; name: string; role: string; spent: number; budgets: Budget[] };
export type FamilyView =
  | { error: "permission_denied"; message: string }
  | { month: string; household_total: number; members: Member[]; family_budgets: Budget[]; recent_alerts: Alert[] };
export type Dashboard = {
  user: User;
  budgets: Status;
  recent_expenses: Expense[];
  alerts: Alert[];
  advice: { text: string; created_at: string }[];
  family: FamilyView;
};

export type TraceItem = {
  id: number;
  turn: number;
  kind: "agent_start" | "agent_end" | "tool_call" | "tool_result" | "tool_error";
  agent: string;
  tool?: string;
  args?: unknown;
  result?: unknown;
  error?: string;
};

export type StreamEvent =
  | ({ type: "trace" } & Omit<TraceItem, "id" | "turn">)
  | { type: "proposal"; proposal: Proposal }
  | { type: "saved"; expense: Expense; alerts: Alert[] }
  | { type: "bill_proposal"; bill: BillProposal }
  | { type: "bill_saved"; bill: BillRecord; alerts: Alert[] }
  | { type: "final"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

export const AGENTS = ["orchestrator", "receipt_agent", "budget_agent", "family_agent", "insights_agent"] as const;
export const CATEGORIES = ["Transport", "Food", "Groceries", "Shopping", "Entertainment", "Utilities", "Health", "Other"];

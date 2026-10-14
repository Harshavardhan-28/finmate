let currency = "INR";
export const setCurrency = (code: string) => { currency = code; };
const SYMBOL: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };

function group(n: number): string {
  const s = String(Math.abs(Math.round(n)));
  if (currency !== "INR" || s.length <= 3) return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + s.slice(-3);
}

/** Whole-unit amount, e.g. ₹7,420. Indian digit grouping for INR. */
export const money = (n: number) => `${n < 0 ? "-" : ""}${SYMBOL[currency] ?? currency + " "}${group(n)}`;
export const CURRENCIES = Object.keys(SYMBOL);

export const dayLabel = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** "Today", "Yesterday", or "Mon 6 Oct". */
export function groupLabel(iso: string) {
  const today = todayIso();
  if (iso === today) return "Today";
  const y = new Date(today + "T12:00:00");
  y.setDate(y.getDate() - 1);
  const yi = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
  return iso === yi ? "Yesterday" : dayLabel(iso);
}

export const monthLabel = (d = new Date()) => d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
export const daysLeftInMonth = (d = new Date()) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate();

export const CATEGORIES = ["Transport", "Food", "Groceries", "Shopping", "Entertainment", "Utilities", "Health", "Other"];
export const CAT_COLOR: Record<string, string> = {
  Transport: "#2f6fde", Food: "#d9822b", Groceries: "#4f9a57", Shopping: "#b4548c",
  Entertainment: "#7b4fd1", Utilities: "#8a7f6a", Health: "#cf4b4b", Other: "#9aa5a2",
};
export const catColor = (c: string) => CAT_COLOR[c] ?? CAT_COLOR.Other;
export const catShort = (c: string) => (c === "Entertainment" ? "Fun" : c);

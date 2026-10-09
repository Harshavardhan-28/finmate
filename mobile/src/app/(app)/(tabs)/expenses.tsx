import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { ExpenseRow } from "@/components/Rows";
import { Screen } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { Chip, Header, Icon, T } from "@/components/ui";
import * as api from "@/lib/api";
import { CATEGORIES, catColor, groupLabel, money, todayIso } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { Expense } from "@/lib/types";
import { useTheme } from "@/lib/theme";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const periodLabel = (p: string) => (p === "all" ? "All time" : `${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`);

export default function Expenses() {
  const { c } = useTheme();
  const { refresh: refreshSession } = useSession();
  const [all, setAll] = useState<Expense[]>([]);
  const [cat, setCat] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>(todayIso().slice(0, 7)); // "YYYY-MM" or "all"
  const [picker, setPicker] = useState(false);

  // The session only keeps 90 days for the dashboard; this screen loads the full history.
  const load = useCallback(() => api.getExpenses(3650).then(setAll).catch(() => undefined), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const refresh = useCallback(async () => { await refreshSession(); await load(); }, [refreshSession, load]);

  const thisMonth = todayIso().slice(0, 7);
  // Months that actually have spending, newest first (always include the current month).
  const months = useMemo(() => {
    const m = new Map<string, { n: number; total: number }>([[thisMonth, { n: 0, total: 0 }]]);
    all.forEach((e) => { const k = e.date.slice(0, 7), v = m.get(k) ?? { n: 0, total: 0 }; m.set(k, { n: v.n + 1, total: v.total + e.amount }); });
    return [...m.entries()].sort((x, y) => y[0].localeCompare(x[0]));
  }, [all, thisMonth]);
  const keys = months.map(([k]) => k);
  const idx = keys.indexOf(period);
  const step = (d: number) => { const k = keys[idx + d]; if (k) setPeriod(k); };

  const inMonth = all.filter((e) => period === "all" || e.date.startsWith(period));
  const list = inMonth.filter((e) => !cat || e.category === cat);
  const groups = useMemo(() => {
    const m = new Map<string, typeof list>();
    list.forEach((e) => m.set(e.date, [...(m.get(e.date) ?? []), e]));
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [list]);

  const remove = (id: number, name: string) =>
    Alert.alert("Delete expense?", `${name} will be removed and your budgets will update.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => api.deleteExpense(id).then(refresh).catch((e) => Alert.alert("Couldn’t delete", e.message)) },
    ]);

  return (
    <Screen tabs onRefresh={refresh}>
      <Header title="Expenses" sub={`${inMonth.length} expense${inMonth.length === 1 ? "" : "s"}`} />
      <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
        <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: 20, padding: 14, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Pressable onPress={() => step(1)} disabled={period === "all" || idx >= keys.length - 1} accessibilityLabel="Previous month" hitSlop={8}
              style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: c.bg, opacity: period === "all" || idx >= keys.length - 1 ? 0.35 : 1 }}>
              <Icon name="back" size={20} />
            </Pressable>
            <Pressable onPress={() => setPicker(true)} accessibilityRole="button" accessibilityLabel="Choose month"
              style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 12 }}>
              <T head w="black" size={20} tight>{periodLabel(period)}</T>
              <Icon name="chevD" size={18} color={c.ink3} />
            </Pressable>
            <Pressable onPress={() => step(-1)} disabled={period === "all" || idx <= 0} accessibilityLabel="Next month" hitSlop={8}
              style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: c.bg, opacity: period === "all" || idx <= 0 ? 0.35 : 1 }}>
              <Icon name="chevR" size={20} />
            </Pressable>
          </View>
          <T head w="black" size={34} tight style={{ textAlign: "center" }}>{money(inMonth.reduce((s, e) => s + e.amount, 0))}</T>
          <T size={13} color={c.ink3} style={{ textAlign: "center" }}>{period === "all" ? "spent in total" : period === thisMonth ? "spent so far this month" : "spent in the month"}</T>
        </View>
      </View>
      <Sheet visible={picker} title="Choose a period" onClose={() => setPicker(false)}>
        <View style={{ gap: 8 }}>
          {[...months.map(([k, v]) => ({ k, label: periodLabel(k), sub: `${v.n} expense${v.n === 1 ? "" : "s"} · ${money(v.total)}` })),
            { k: "all", label: "All time", sub: `${all.length} expenses · ${money(all.reduce((s, e) => s + e.amount, 0))}` }].map((o) => (
            <Pressable key={o.k} onPress={() => { setPeriod(o.k); setPicker(false); }} accessibilityRole="button"
              style={{ minHeight: 56, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                backgroundColor: c.card, borderWidth: o.k === period ? 2 : 1, borderColor: o.k === period ? c.ink : c.line }}>
              <View><T w="bold" size={16}>{o.label}</T><T size={13} color={c.ink3}>{o.sub}</T></View>
              {o.k === period ? <T w="black" color={c.limeInk}>✓</T> : null}
            </Pressable>
          ))}
        </View>
      </Sheet>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingBottom: 8 }}>
        <Chip label="All" active={!cat} onPress={() => setCat(null)} />
        {CATEGORIES.map((k) => <Chip key={k} label={k} dot={catColor(k)} active={cat === k} onPress={() => setCat(cat === k ? null : k)} />)}
      </ScrollView>
      <View style={{ paddingHorizontal: 20 }}>
        {groups.length === 0 ? <T size={15} color={c.ink3} style={{ paddingTop: 24, textAlign: "center" }}>Nothing here yet.</T> : null}
        {groups.map(([date, rows]) => (
          <View key={date} style={{ paddingTop: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <T w="black" size={13} color={c.ink3} style={{ textTransform: "uppercase", letterSpacing: 0.8 }}>{groupLabel(date)}</T>
              <T w="bold" size={13} color={c.ink3}>{money(rows.reduce((s, e) => s + e.amount, 0))}</T>
            </View>
            {rows.map((e, i) => <ExpenseRow key={e.id} e={e} last={i === rows.length - 1} onLongPress={() => remove(e.id, e.merchant)} />)}
          </View>
        ))}
        {groups.length ? <T size={12} color={c.ink3} style={{ paddingTop: 14, textAlign: "center" }}>Press and hold an expense to delete it.</T> : null}
      </View>
    </Screen>
  );
}

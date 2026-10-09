import { useState } from "react";
import { Pressable, View } from "react-native";
import { BudgetBlock } from "@/components/Rows";
import { Screen } from "@/components/Screen";
import { Button, Card, Field, Header, RoundBtn, Segmented, T, levelColors } from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import { Alert } from "react-native";
import * as api from "@/lib/api";
import { CATEGORIES, daysLeftInMonth, money } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import type { Budget } from "@/lib/types";

export default function Budgets() {
  const { c } = useTheme();
  const { dash, refresh, user } = useSession();
  const [scope, setScope] = useState<"user" | "family">("user");
  const [edit, setEdit] = useState<{ category: string; limit: string } | null>(null);
  const warn = dash?.budgets.warn_pct ?? 80;
  const rows = (scope === "user" ? dash?.budgets.personal : dash?.budgets.family) ?? [];
  const limit = rows.reduce((s, b) => s + b.limit, 0);
  const spent = rows.reduce((s, b) => s + b.spent, 0);
  const pct = limit ? Math.round((spent / limit) * 100) : 0;
  const canFamily = user.role === "admin";
  const label = (b: Budget) => (b.level === "exceeded" ? "Over limit" : b.level === "warning" ? "Near limit" : "On track");

  async function save() {
    if (!edit) return;
    const n = Number(edit.limit.replace(/[^0-9.]/g, ""));
    if (!n || n <= 0) return Alert.alert("Enter a monthly limit above zero");
    try { await api.putBudget(scope, edit.category, n); setEdit(null); await refresh(); } catch (e) { Alert.alert("Couldn’t save", e instanceof Error ? e.message : ""); }
  }
  const unset = CATEGORIES.filter((k) => !rows.some((b) => b.category === k));

  return (
    <Screen tabs onRefresh={refresh}>
      <Header title="Budgets" sub={`Alerts at ${warn}% and 100%`} right={<RoundBtn icon="plus" label="Add budget" onPress={() => setEdit({ category: unset[0] ?? CATEGORIES[0], limit: "" })} />} />
      <View style={{ paddingHorizontal: 20, gap: 16 }}>
        <Segmented value={scope} onChange={setScope} options={[{ value: "user", label: "Mine" }, { value: "family", label: "Family" }]} />
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
          <View style={{ width: 92, height: 92, borderRadius: 46, borderWidth: 10, borderColor: c.line, alignItems: "center", justifyContent: "center" }}>
            <View style={{ position: "absolute", inset: -10, borderRadius: 56, borderWidth: 10, borderColor: "transparent", borderTopColor: levelColors(c, pct > 100 ? "exceeded" : pct >= warn ? "warning" : "ok").bar, borderRightColor: pct > 25 ? levelColors(c, pct > 100 ? "exceeded" : pct >= warn ? "warning" : "ok").bar : "transparent", transform: [{ rotate: "-45deg" }] }} />
            <T head w="black" size={24} tight>{pct}%</T>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T size={13} color={c.ink3}>Spent of {money(limit)}</T>
            <T head w="black" size={30} tight>{money(spent)}</T>
            <T size={13} color={c.ink3}>{money(Math.max(0, limit - spent))} left · {daysLeftInMonth()} days</T>
          </View>
        </Card>
        {rows.length === 0 ? <T size={15} color={c.ink3}>{scope === "family" && !canFamily ? "Your admin hasn’t set shared budgets yet." : "No budgets yet. Tap + to set one."}</T> : null}
        {rows.map((b) => {
          const col = levelColors(c, b.level);
          return (
            <Pressable key={b.category} onPress={() => (scope === "family" && !canFamily ? undefined : setEdit({ category: b.category, limit: String(b.limit) }))} accessibilityLabel={`${b.category}, ${label(b)}. Edit limit`}>
              <Card style={{ gap: 10 }}>
                <View style={{ alignSelf: "flex-end", backgroundColor: col.soft, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3, position: "absolute", top: 14, right: 14 }}><T w="black" size={11} color={col.ink}>{label(b)}</T></View>
                <BudgetBlock b={b} tick={warn} />
              </Card>
            </Pressable>
          );
        })}
      </View>
      <Sheet visible={!!edit} title={edit && rows.some((b) => b.category === edit.category) ? `${edit.category} budget` : "New budget"} onClose={() => setEdit(null)}
        actions={<Button kind="lime" label="Save budget" onPress={save} />}>
        {edit && !rows.some((b) => b.category === edit.category) ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {CATEGORIES.map((k) => (
              <Pressable key={k} onPress={() => setEdit({ ...edit, category: k })} style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 99, justifyContent: "center", backgroundColor: edit.category === k ? c.btnBg : c.card, borderWidth: 1, borderColor: edit.category === k ? c.btnBg : c.border }}>
                <T w="bold" size={14} color={edit.category === k ? c.btnFg : c.ink}>{k}</T>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Field label="Monthly limit" value={edit?.limit ?? ""} onChangeText={(t) => edit && setEdit({ ...edit, limit: t })} keyboardType="numeric" placeholder="e.g. 8000" />
      </Sheet>
    </Screen>
  );
}

import { router } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { ExpenseRow } from "@/components/Rows";
import { Screen } from "@/components/Screen";
import { Avatar, Icon, Meter, RoundBtn, T, levelColors } from "@/components/ui";
import { daysLeftInMonth, monthLabel, money, todayIso, groupLabel } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

const ACTIONS = [
  { label: "Scan", icon: "camera", go: "/add?tab=scan" },
  { label: "Speak", icon: "mic", go: "/add?tab=speak" },
  { label: "Type", icon: "type", go: "/add?tab=type" },
  { label: "Ask", icon: "chat", go: "/assistant" },
];

export default function Home() {
  const { c } = useTheme();
  const { user, dash, expenses, refresh, offline } = useSession();
  const budgets = dash?.budgets.personal ?? [];
  const month = todayIso().slice(0, 7);
  const spent = expenses.filter((e) => e.date.startsWith(month)).reduce((s, e) => s + e.amount, 0);
  const budgeted = budgets.reduce((s, b) => s + b.limit, 0);
  const worst = budgets.find((b) => b.level === "exceeded") ?? budgets.find((b) => b.level === "warning");
  const alerts = (dash?.alerts.length ?? 0) > 0;
  const recent = expenses.slice(0, 4);
  const first = user.name.split(" ")[0];
  const bar = budgets.filter((b) => b.spent > 0);

  return (
    <Screen tabs onRefresh={refresh}>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable onPress={() => router.push("/settings")} accessibilityLabel="Settings"><Avatar name={user.name} /></Pressable>
        <View style={{ flex: 1 }}>
          <T size={12} color={c.ink3}>{user.role === "admin" ? "Your household" : "Family member"}</T>
          <T w="black" size={16}>{first}</T>
        </View>
        <RoundBtn icon="bell" label="Alerts" dot={alerts} onPress={() => router.push("/alerts")} />
      </View>
      {offline ? <View style={{ margin: 20, padding: 12, borderRadius: 14, backgroundColor: c.badSoft }}><T w="bold" size={14} color={c.badInk}>Can’t reach the FinMate server. Pull down to retry.</T></View> : null}

      <View style={{ paddingHorizontal: 20, paddingTop: 22 }}>
        <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 99, backgroundColor: c.hover }}>
          <T w="bold" size={13}>{monthLabel()}</T><Icon name="chevD" size={14} />
        </View>
        <T head w="black" size={56} tight style={{ marginTop: 14, lineHeight: 58 }}>{money(spent)}</T>
        <T size={14} color={c.ink3} style={{ marginTop: 6 }}>{budgeted ? `spent of ${money(budgeted)} budgeted · ` : ""}{daysLeftInMonth()} days left</T>
        <View style={{ height: 8, borderRadius: 9, backgroundColor: c.line, marginTop: 14, flexDirection: "row", overflow: "hidden", gap: 2 }}>
          {bar.map((b) => <View key={b.category} style={{ width: `${Math.min(100, (b.spent / Math.max(budgeted, spent, 1)) * 100)}%`, backgroundColor: levelColors(c, b.level).bar }} />)}
        </View>
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 22, flexDirection: "row", justifyContent: "space-between" }}>
        {ACTIONS.map((a, i) => (
          <Pressable key={a.label} onPress={() => router.push(a.go as never)} accessibilityRole="button" style={{ alignItems: "center", gap: 8, minWidth: 64 }}>
            <View style={{ width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", backgroundColor: i === 0 ? c.lime : c.card, borderWidth: i === 0 ? 0 : 1, borderColor: c.line }}>
              <Icon name={a.icon} size={24} color={i === 0 ? "#121211" : c.ink} />
            </View>
            <T w="bold" size={13}>{a.label}</T>
          </Pressable>
        ))}
      </View>

      {worst ? (
        <Pressable onPress={() => router.push("/alerts")} style={{ marginHorizontal: 20, marginTop: 20, padding: 14, borderRadius: 16, backgroundColor: levelColors(c, worst.level).soft, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: levelColors(c, worst.level).bar, alignItems: "center", justifyContent: "center" }}><Icon name="alert" size={20} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <T w="black" size={14}>{worst.category} is {worst.level === "exceeded" ? "over budget" : "near its limit"}</T>
            <T size={13} color={c.ink3}>{worst.level === "exceeded" ? `${money(worst.spent - worst.limit)} above your ${money(worst.limit)} limit` : `${money(worst.limit - worst.spent)} left of ${money(worst.limit)}`}</T>
          </View>
          <Icon name="chevR" size={18} color={c.ink3} />
        </Pressable>
      ) : null}

      <View style={{ paddingHorizontal: 20, paddingTop: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <T w="black" size={17}>Budgets</T>
        <Pressable onPress={() => router.navigate("/budgets")} hitSlop={12}><T w="black" size={13} color={c.limeInk}>See all</T></Pressable>
      </View>
      {budgets.length === 0 ? (
        <T size={14} color={c.ink3} style={{ paddingHorizontal: 20, paddingTop: 10 }}>No budgets yet. Set one from the Budgets tab.</T>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 20, paddingTop: 12 }}>
          {budgets.map((b) => {
            const col = levelColors(c, b.level);
            return (
              <View key={b.category} style={{ width: 150, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: 18, padding: 16, gap: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T w="bold" size={14}>{b.category}</T><T w="black" size={14} color={col.ink}>{Math.round(b.pct)}%</T></View>
                <Meter pct={b.pct} level={b.level} height={6} tick={null} />
                <T size={12} color={c.ink3}>{money(b.spent)} of {money(b.limit)}</T>
              </View>
            );
          })}
        </ScrollView>
      )}

      <View style={{ paddingHorizontal: 20, paddingTop: 18 }}>
        <T w="black" size={17}>Latest</T>
        {recent.length === 0 ? <T size={14} color={c.ink3} style={{ paddingTop: 10 }}>No expenses yet. Tap + to add the first one.</T> : null}
        {recent.map((e, i) => <ExpenseRow key={e.id} e={e} last={i === recent.length - 1} />)}
        {recent[0] ? <T size={12} color={c.ink3}>Latest from {groupLabel(recent[0].date).toLowerCase()}</T> : null}
      </View>
    </Screen>
  );
}

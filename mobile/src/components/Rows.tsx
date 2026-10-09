import { Pressable, View } from "react-native";
import { catColor } from "@/lib/format";
import { money } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import type { Budget, Expense } from "@/lib/types";
import { Meter, T, levelColors } from "./ui";

export function ExpenseRow({ e, last, onLongPress }: { e: Expense; last?: boolean; onLongPress?: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onLongPress={onLongPress} accessibilityLabel={`${e.merchant}, ${money(e.amount)}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, minHeight: 68, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: c.hover, alignItems: "center", justifyContent: "center" }}>
        <T w="black" size={16}>{e.merchant.slice(0, 1).toUpperCase()}</T>
        <View style={{ position: "absolute", right: -2, bottom: -2, width: 13, height: 13, borderRadius: 4, backgroundColor: catColor(e.category), borderWidth: 2, borderColor: c.bg }} />
      </View>
      <View style={{ flex: 1 }}>
        <T w="bold" size={16} numberOfLines={1}>{e.merchant}</T>
        <T size={13} color={c.ink3} numberOfLines={1}>{e.category}{e.note ? ` · ${e.note}` : ""}</T>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <T w="black" size={16}>{money(e.amount)}</T>
        <T size={11} color={c.ink3} style={{ textTransform: "capitalize" }}>{e.source}</T>
      </View>
    </Pressable>
  );
}

export function BudgetBlock({ b, tick }: { b: Budget; tick?: number }) {
  const { c } = useTheme();
  const col = levelColors(c, b.level);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: catColor(b.category) }} />
          <T w="bold" size={16}>{b.category}</T>
        </View>
        <T w="black" size={15} color={col.ink}>{Math.round(b.pct)}%{b.level === "exceeded" ? " · over" : ""}</T>
      </View>
      <Meter pct={b.pct} level={b.level} tick={tick ?? 80} />
      <T size={13} color={c.ink3}>{money(b.spent)} of {money(b.limit)}</T>
    </View>
  );
}

import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Chip, Icon, T } from "@/components/ui";
import { buildAlerts } from "@/lib/alerts";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

const FILTERS = [{ k: "all", l: "All" }, { k: "budgets", l: "Budgets" }, { k: "family", l: "Family" }, { k: "tips", l: "Tips" }] as const;

export default function Alerts() {
  const { c } = useTheme();
  const { dash, refresh } = useSession();
  const [f, setF] = useState<(typeof FILTERS)[number]["k"]>("all");
  const items = buildAlerts(dash).filter((i) => f === "all" || i.kind === f);
  const tone = (t: string) => t === "bad" ? { bg: c.badSoft, fg: c.badInk, icon: "alert" } : t === "warn" ? { bg: c.warnSoft, fg: c.warnInk, icon: "alert" } : t === "tip" ? { bg: c.limeSoft, fg: c.limeInk, icon: "bulb" } : { bg: c.limeSoft, fg: c.limeInk, icon: "check" };

  return (
    <Screen onRefresh={refresh}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, minHeight: 56 }}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Back" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Icon name="back" /></Pressable>
        <T w="black" size={17} style={{ flex: 1, textAlign: "center" }}>Alerts</T>
        <Pressable onPress={() => router.push("/settings")} accessibilityLabel="Settings" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Icon name="settings" /></Pressable>
      </View>
      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingBottom: 8, flexWrap: "wrap" }}>
        {FILTERS.map((x) => <Chip key={x.k} label={x.l} active={f === x.k} onPress={() => setF(x.k)} />)}
      </View>
      <View style={{ paddingHorizontal: 20 }}>
        {items.length === 0 ? <T size={15} color={c.ink3} style={{ textAlign: "center", paddingTop: 36 }}>Nothing to flag right now.</T> : null}
        {(["Today", "This week"] as const).map((g) => {
          const rows = items.filter((i) => i.group === g);
          if (!rows.length) return null;
          return (
            <View key={g} style={{ paddingTop: 14 }}>
              <T w="black" size={13} color={c.ink3} style={{ textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>{g}</T>
              {rows.map((i) => {
                const t = tone(i.tone);
                return (
                  <View key={i.id} style={{ flexDirection: "row", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line }}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.bg, alignItems: "center", justifyContent: "center" }}><Icon name={t.icon} size={20} color={t.fg} /></View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}><T w="black" size={15} style={{ flex: 1 }}>{i.title}</T><T size={12} color={c.ink3}>{i.when}</T></View>
                      <T size={14} color={c.ink2} style={{ lineHeight: 20 }}>{i.body}</T>
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

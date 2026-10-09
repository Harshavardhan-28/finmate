import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Chip, Field, Icon, T } from "@/components/ui";
import { CATEGORIES, catColor, catShort, dayLabel, money } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import type { Proposal } from "@/lib/types";

export default function Confirm() {
  const { c } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const { proposal, clearProposal, confirm, busy, dash } = useSession();
  const [p, setP] = useState<Proposal | null>(proposal);
  const [pick, setPick] = useState(false);
  if (!p) { router.back(); return null; }
  const unclear = (k: string) => p.unclear_fields.includes(k);
  const budget = dash?.budgets.personal.find((b) => b.category === p.category);
  const after = budget && budget.limit ? Math.round(((budget.spent + p.amount) / budget.limit) * 100) : null;

  const close = () => { clearProposal(); router.back(); };
  async function save() {
    if (!p) return;
    try {
      const alerts = await confirm(p);
      close();
      const worst = alerts[0];
      if (worst) setTimeout(() => Alert.alert(worst.level === "exceeded" ? "Over budget" : "Near limit", worst.message), 350);
    } catch (e) { Alert.alert("Couldn’t save", e instanceof Error ? e.message : ""); }
  }
  const row = (label: string, node: React.ReactNode, flag?: boolean) => (
    <View style={{ borderRadius: 14, padding: 14, backgroundColor: flag ? c.warnSoft : c.card, borderWidth: 1, borderColor: flag ? c.warn : c.line, gap: 4 }}>
      <T w="bold" size={12} color={flag ? c.warnInk : c.ink3}>{label}{flag ? " · check this" : ""}</T>
      {node}
    </View>
  );
  return (
    <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
      <Pressable accessibilityLabel="Close" onPress={close} style={{ flex: 1 }} />
      <View style={{ backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: bottom + 16, gap: 12 }}>
        <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: c.border }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.limeSoft, alignItems: "center", justifyContent: "center" }}><Icon name="receipt" color={c.limeInk} /></View>
          <View style={{ flex: 1 }}>
            <T w="black" size={18}>Confirm this expense</T>
            <T size={13} color={c.ink3}>Read from your {p.source === "voice" ? "voice note" : "receipt"}. Fix anything that’s off.</T>
          </View>
        </View>
        <View style={{ alignItems: "center", paddingVertical: 8 }}>
          <T head w="black" size={52} tight>{money(p.amount)}</T>
          <T size={14} color={c.ink3}>{p.merchant} · {dayLabel(p.date)}</T>
        </View>
        <Field label="Merchant" value={p.merchant} onChangeText={(t) => setP({ ...p, merchant: t })} />
        {row("Category", (
          <Pressable onPress={() => setPick(!pick)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 30 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: catColor(p.category) }} /><T w="black" size={16}>{p.category}</T></View>
            <Icon name="chevD" size={18} />
          </Pressable>
        ), unclear("category"))}
        {pick ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {CATEGORIES.map((k) => <Chip key={k} label={catShort(k)} dot={catColor(k)} active={p.category === k} onPress={() => { setP({ ...p, category: k }); setPick(false); }} />)}
          </View>
        ) : null}
        <Field label="Note" value={p.note} onChangeText={(t) => setP({ ...p, note: t })} />
        {after !== null ? (
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center", padding: 12, borderRadius: 14, backgroundColor: after > 100 ? c.badSoft : after >= (dash?.budgets.warn_pct ?? 80) ? c.warnSoft : c.limeSoft }}>
            <Icon name="alert" size={20} color={after > 100 ? c.badInk : c.ink2} />
            <T size={14} style={{ flex: 1 }}>This takes <T w="black" size={14}>{p.category} to {after}%</T> of its limit.</T>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
          <Button kind="plain" label="Discard" onPress={close} style={{ flex: 1 }} />
          <Button kind="lime" label={busy ? "Saving…" : "Confirm and save"} onPress={save} disabled={busy || !p.amount} style={{ flex: 2 }} />
        </View>
      </View>
    </View>
  );
}

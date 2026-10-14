import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Options, Sheet } from "@/components/Sheet";
import { Button, Field, Icon, T } from "@/components/ui";
import { CATEGORIES, catColor, catShort, dayLabel, money } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import type { BillItem, BillProposal } from "@/lib/types";

const round2 = (n: number) => Math.round(n * 100) / 100;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Review a scanned bill: every line item with its own category, all saved together as one bill. */
export default function Bill() {
  const { c } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const { bill, clearBill, confirmBill, busy, dash } = useSession();
  const [b, setB] = useState<BillProposal | null>(bill);
  const [cat, setCat] = useState<number | null>(null);          // index of the item whose category is being picked
  const [amounts, setAmounts] = useState<string[]>(() => (bill?.items ?? []).map((i) => String(i.amount)));

  const total = useMemo(() => round2((b?.items ?? []).reduce((s, i) => s + (Number(i.amount) || 0), 0)), [b]);
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    (b?.items ?? []).forEach((i) => m.set(i.category, round2((m.get(i.category) ?? 0) + (Number(i.amount) || 0))));
    return [...m.entries()].sort((x, y) => y[1] - x[1]);
  }, [b]);
  if (!b) { router.back(); return null; }

  const unclear = (k: string) => b.unclear_fields.includes(k);
  const close = () => { clearBill(); router.back(); };
  const setItem = (idx: number, patch: Partial<BillItem>) => setB({ ...b, items: b.items.map((it, n) => (n === idx ? { ...it, ...patch } : it)) });
  const setAmount = (idx: number, text: string) => {
    setAmounts((a) => a.map((v, n) => (n === idx ? text : v)));
    setItem(idx, { amount: Number(text.replace(/[^0-9.]/g, "")) || 0 });
  };
  const removeItem = (idx: number) => { setB({ ...b, items: b.items.filter((_, n) => n !== idx) }); setAmounts((a) => a.filter((_, n) => n !== idx)); };
  const addItem = () => { setB({ ...b, items: [...b.items, { name: "", quantity: null, unit_price: null, amount: 0, category: "Other" }] }); setAmounts((a) => [...a, ""]); };
  const valid = b.merchant.trim() && ISO.test(b.date) && b.items.length > 0 && b.items.every((i) => i.name.trim() && i.amount > 0);
  const printed = b.total;
  const mismatch = Math.abs(printed - total) > 1;

  async function save() {
    if (!b) return;
    try {
      // The total is what the lines add up to, so the saved bill always equals its items.
      const worst = (await confirmBill({ ...b, total, tax_fees: b.tax_fees, discount: b.discount }))[0];
      close();
      if (worst) setTimeout(() => Alert.alert(worst.level === "exceeded" ? "Over budget" : "Near limit", worst.message), 350);
    } catch (e) { Alert.alert("Couldn’t save", e instanceof Error ? e.message : ""); }
  }

  return (
    <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
      <Pressable accessibilityLabel="Close" onPress={close} style={{ flex: 0.08 }} />
      <View style={{ flex: 0.92, backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10 }}>
        <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: c.border, marginBottom: 10 }} />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.limeSoft, alignItems: "center", justifyContent: "center" }}><Icon name="receipt" color={c.limeInk} /></View>
            <View style={{ flex: 1 }}>
              <T w="black" size={18}>Review this bill</T>
              <T size={13} color={c.ink3}>{b.items.length} item{b.items.length === 1 ? "" : "s"} found. Fix anything that’s off.</T>
            </View>
          </View>

          <View style={{ alignItems: "center", paddingVertical: 4 }}>
            <T head w="black" size={46} tight>{money(total)}</T>
            <T size={14} color={c.ink3}>{b.merchant || "Merchant"} · {ISO.test(b.date) ? dayLabel(b.date) : b.date}</T>
          </View>

          {mismatch ? (
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center", padding: 12, borderRadius: 14, backgroundColor: c.warnSoft }}>
              <Icon name="alert" size={20} color={c.warnInk} />
              <T size={13} style={{ flex: 1 }}>The bill says <T w="black" size={13}>{money(printed)}</T> but these items add up to <T w="black" size={13}>{money(total)}</T>. Check the amounts.</T>
            </View>
          ) : null}

          <Field label={unclear("merchant") ? "Merchant · check this" : "Merchant"} value={b.merchant} onChangeText={(t) => setB({ ...b, merchant: t })} />
          <Field label={unclear("date") ? "Date (YYYY-MM-DD) · check this" : "Date (YYYY-MM-DD)"} value={b.date} onChangeText={(t) => setB({ ...b, date: t })} autoCapitalize="none" />

          {byCat.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {byCat.map(([k, v]) => {
                const bud = dash?.budgets.personal.find((x) => x.category === k);
                const after = bud && bud.limit ? Math.round(((bud.spent + v) / bud.limit) * 100) : null;
                return (
                  <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, minHeight: 36, borderRadius: 99, backgroundColor: c.card, borderWidth: 1, borderColor: after !== null && after > 100 ? c.bad : c.line }}>
                    <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: catColor(k) }} />
                    <T w="bold" size={13}>{catShort(k)} {money(v)}{after !== null ? ` · ${after}%` : ""}</T>
                  </View>
                );
              })}
            </ScrollView>
          ) : null}

          <T w="black" size={13} color={c.ink3} style={{ textTransform: "uppercase", letterSpacing: 0.8, marginTop: 4 }}>Items</T>
          {b.items.map((it, idx) => (
            <View key={idx} style={{ backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.line, padding: 12, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <TextInput value={it.name} onChangeText={(t) => setItem(idx, { name: t })} placeholder="Item name" placeholderTextColor={c.ink3}
                  style={{ flex: 1, minHeight: 44, fontSize: 16, color: c.ink, fontFamily: undefined, fontWeight: "600" }} />
                <Pressable onPress={() => removeItem(idx)} accessibilityLabel={`Remove ${it.name || "item"}`} hitSlop={8} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
                  <Icon name="x" size={18} color={c.ink3} />
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <Pressable onPress={() => setCat(idx)} accessibilityLabel={`Category ${it.category}. Change`} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: 10, borderRadius: 99, backgroundColor: c.bg }}>
                  <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: catColor(it.category) }} />
                  <T w="bold" size={13}>{catShort(it.category)}</T>
                  <Icon name="chevD" size={14} color={c.ink3} />
                </Pressable>
                <T size={12} color={c.ink3} style={{ flex: 1 }} numberOfLines={1}>
                  {it.quantity && it.quantity !== 1 ? `${it.quantity} ×${it.unit_price ? ` ${money(it.unit_price)}` : ""}` : ""}
                </T>
                <View style={{ flexDirection: "row", alignItems: "center", minWidth: 110, justifyContent: "flex-end" }}>
                  <T w="bold" size={15} color={c.ink3}>₹</T>
                  <TextInput value={amounts[idx] ?? ""} onChangeText={(t) => setAmount(idx, t)} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={c.ink3}
                    style={{ minWidth: 80, minHeight: 40, textAlign: "right", fontSize: 17, fontWeight: "800", color: c.ink }} />
                </View>
              </View>
            </View>
          ))}
          <Pressable onPress={addItem} accessibilityRole="button" style={{ minHeight: 48, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", borderColor: c.border, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}>
            <Icon name="plus" size={18} color={c.ink2} /><T w="bold" size={15} color={c.ink2}>Add an item</T>
          </Pressable>
          {b.tax_fees > 0 || b.discount > 0 ? (
            <T size={12} color={c.ink3}>{b.tax_fees > 0 ? `Includes ${money(b.tax_fees)} taxes/fees/rounding. ` : ""}{b.discount > 0 ? `Item prices were adjusted for a ${money(b.discount)} discount.` : ""}</T>
          ) : null}
        </ScrollView>
        <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: bottom + 16, borderTopWidth: 1, borderTopColor: c.line }}>
          <Button kind="plain" label="Discard" onPress={close} style={{ flex: 1 }} />
          <Button kind="lime" label={busy ? "Saving…" : `Save bill · ${money(total)}`} onPress={save} disabled={busy || !valid} style={{ flex: 2 }} />
        </View>
      </View>
      <Sheet visible={cat !== null} title="Category" onClose={() => setCat(null)}>
        <Options options={CATEGORIES.map((k) => ({ value: k, label: k }))} value={cat !== null ? b.items[cat]?.category ?? "Other" : "Other"}
          onPick={(k) => { if (cat !== null) setItem(cat, { category: k }); setCat(null); }} />
      </Sheet>
    </View>
  );
}

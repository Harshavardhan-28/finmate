import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, Share, Switch, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Options, Sheet } from "@/components/Sheet";
import { Avatar, Button, Card, Field, Icon, T } from "@/components/ui";
import * as api from "@/lib/api";
import { CURRENCIES } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

type Panel = null | "warn" | "currency" | "appearance" | "size" | "password" | "delete";

export default function Settings() {
  const { c, appearance, setAppearance, textSize, setTextSize } = useTheme();
  const { user, setUser, logout, refresh } = useSession();
  const [panel, setPanel] = useState<Panel>(null);
  const [alertsOn, setAlertsOn] = useState(true);
  const [pw, setPw] = useState({ cur: "", next: "" });
  const [del, setDel] = useState({ email: "", pw: "" });
  const [busy, setBusy] = useState(false);
  const fail = (e: unknown) => Alert.alert("Something went wrong", e instanceof Error ? e.message : "Try again.");

  const savePrefs = async (currency: string, warn: number) => {
    try { setUser(await api.updatePreferences(currency, warn)); await refresh(); setPanel(null); } catch (e) { fail(e); }
  };
  const row = (label: string, value: string | undefined, onPress: () => void, danger?: boolean) => (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ minHeight: 54, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.line }}>
      <T w="bold" size={16} color={danger ? c.badInk : c.ink} style={{ flex: 1 }}>{label}</T>
      {value ? <T w="semi" size={15} color={c.ink3}>{value}</T> : null}
      {!danger ? <Icon name="chevR" size={18} color={c.ink3} /> : null}
    </Pressable>
  );
  const section = (t: string) => <T w="black" size={12} color={c.ink3} style={{ textTransform: "uppercase", letterSpacing: 1, marginTop: 22, marginBottom: 8, marginLeft: 4 }}>{t}</T>;

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, minHeight: 56 }}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Back" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Icon name="back" /></Pressable>
        <T w="black" size={17} style={{ flex: 1, textAlign: "center" }}>Settings</T>
        <View style={{ width: 44 }} />
      </View>
      <View style={{ paddingHorizontal: 20 }}>
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Avatar name={user.name} size={52} />
          <View style={{ flex: 1 }}>
            <T w="black" size={18}>{user.name}</T>
            <T size={14} color={c.ink3}>{user.role === "admin" ? "Family admin" : "Family member"} · {user.email}</T>
          </View>
        </Card>

        {section("Preferences")}
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {row("Warning line", `${user.warn_pct}%`, () => setPanel("warn"))}
          {row("Currency", user.currency, () => setPanel("currency"))}
          {row("Appearance", appearance[0].toUpperCase() + appearance.slice(1), () => setPanel("appearance"))}
          {row("Text size", textSize === "large" ? "Large" : "Normal", () => setPanel("size"))}
          <View style={{ minHeight: 54, flexDirection: "row", alignItems: "center", paddingHorizontal: 16 }}>
            <T w="bold" size={16} style={{ flex: 1 }}>Budget alerts</T>
            <Switch value={alertsOn} onValueChange={setAlertsOn} trackColor={{ true: c.limeInk, false: c.border }} thumbColor="#fff" />
          </View>
        </Card>

        {section("Security")}
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {row("Change password", undefined, () => setPanel("password"))}
          {row("Sign out everywhere", undefined, () => Alert.alert("Sign out everywhere?", "Every other device will be signed out.", [
            { text: "Cancel", style: "cancel" },
            { text: "Sign out", style: "destructive", onPress: () => api.signOutEverywhere().then(logout).catch(fail) },
          ]))}
          {row("Sign out", undefined, logout)}
        </Card>

        {section("Your data")}
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {row("Export expenses (CSV)", undefined, async () => { try { await Share.share({ message: await api.exportCsv(), title: "finmate-expenses.csv" }); } catch (e) { fail(e); } })}
          {row("Delete account", undefined, () => setPanel("delete"), true)}
        </Card>
      </View>

      <Sheet visible={panel === "warn"} title="Warning line" onClose={() => setPanel(null)}>
        <T size={15} color={c.ink2}>You’re warned when a budget reaches this share of its limit, and again at 100%.</T>
        <Options value={user.warn_pct} onPick={(v) => savePrefs(user.currency, v)} options={[50, 60, 70, 80, 90, 95].map((v) => ({ value: v, label: `${v}%` }))} />
      </Sheet>
      <Sheet visible={panel === "currency"} title="Currency" onClose={() => setPanel(null)}>
        <Options value={user.currency} onPick={(v) => savePrefs(v, user.warn_pct)} options={CURRENCIES.map((v) => ({ value: v, label: v }))} />
      </Sheet>
      <Sheet visible={panel === "appearance"} title="Appearance" onClose={() => setPanel(null)}>
        <Options value={appearance} onPick={(v) => { setAppearance(v); setPanel(null); }} options={[{ value: "system", label: "Match my phone" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
      </Sheet>
      <Sheet visible={panel === "size"} title="Text size" onClose={() => setPanel(null)}>
        <Options value={textSize} onPick={(v) => { setTextSize(v); setPanel(null); }} options={[{ value: "normal", label: "Normal" }, { value: "large", label: "Large" }]} />
      </Sheet>
      <Sheet visible={panel === "password"} title="Change password" onClose={() => setPanel(null)}
        actions={<Button kind="lime" label={busy ? "Saving…" : "Change password"} disabled={busy || !pw.cur || pw.next.length < 8} onPress={async () => {
          setBusy(true);
          try { await api.changePassword(pw.cur, pw.next); setPw({ cur: "", next: "" }); setPanel(null); Alert.alert("Password changed", "Other devices were signed out."); } catch (e) { fail(e); } finally { setBusy(false); }
        }} />}>
        <Field label="Current password" value={pw.cur} onChangeText={(t) => setPw({ ...pw, cur: t })} secureTextEntry autoCapitalize="none" />
        <Field label="New password (8+ characters)" value={pw.next} onChangeText={(t) => setPw({ ...pw, next: t })} secureTextEntry autoCapitalize="none" />
      </Sheet>
      <Sheet visible={panel === "delete"} title="Delete account" onClose={() => setPanel(null)}
        actions={<Button kind="danger" label={busy ? "Deleting…" : "Delete everything"} disabled={busy || !del.email || !del.pw} onPress={async () => {
          setBusy(true);
          try { await api.deleteAccount(del.email, del.pw); await logout(); } catch (e) { fail(e); } finally { setBusy(false); }
        }} />}>
        <T size={15} color={c.ink2}>This permanently removes your account and everything attached to it. Type your email and password to confirm.</T>
        <Field label="Email" value={del.email} onChangeText={(t) => setDel({ ...del, email: t })} autoCapitalize="none" keyboardType="email-address" />
        <Field label="Password" value={del.pw} onChangeText={(t) => setDel({ ...del, pw: t })} secureTextEntry autoCapitalize="none" />
      </Sheet>
    </Screen>
  );
}

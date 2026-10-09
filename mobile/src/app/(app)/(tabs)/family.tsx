import { useState } from "react";
import { Alert, View } from "react-native";
import { BudgetBlock } from "@/components/Rows";
import { Screen } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { Avatar, Button, Card, Field, Header, Icon, Segmented, T } from "@/components/ui";
import { Pressable } from "react-native";
import * as api from "@/lib/api";
import { money } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

export default function Family() {
  const { c } = useTheme();
  const { dash, user, refresh } = useSession();
  const [invite, setInvite] = useState(false);
  const [f, setF] = useState({ name: "", email: "", password: "", role: "member" });
  const [busy, setBusy] = useState(false);
  const fam = dash?.family;
  const view = fam && !("error" in fam) ? fam : null;

  async function add() {
    setBusy(true);
    try { await api.addMember(f); setInvite(false); setF({ name: "", email: "", password: "", role: "member" }); await refresh(); }
    catch (e) { Alert.alert("Couldn’t add member", e instanceof Error ? e.message : ""); } finally { setBusy(false); }
  }

  return (
    <Screen tabs onRefresh={refresh}>
      <Header title="Family" sub={view ? "Your household" : "Household"}
        right={user.role === "admin" ? <Pressable onPress={() => setInvite(true)} accessibilityRole="button" style={{ minHeight: 44, flexDirection: "row", gap: 6, alignItems: "center", paddingHorizontal: 14, borderRadius: 22, backgroundColor: c.lime }}><Icon name="userPlus" size={18} color="#121211" /><T w="black" size={14} color="#121211">Invite</T></Pressable> : undefined} />
      <View style={{ paddingHorizontal: 20, gap: 16 }}>
        {!view ? (
          <Card style={{ gap: 6 }}>
            <T w="black" size={17}>Admins only</T>
            <T size={15} color={c.ink2}>{fam && "error" in fam ? fam.message : "The household view is for family admins. You can still see shared budgets on the Budgets tab."}</T>
          </Card>
        ) : (
          <>
            <Card style={{ gap: 10 }}>
              <T size={13} color={c.ink3}>Household spend · this month</T>
              <T head w="black" size={44} tight>{money(view.household_total)}</T>
              <View style={{ height: 8, borderRadius: 9, flexDirection: "row", gap: 2, overflow: "hidden", backgroundColor: c.line }}>
                {view.members.map((m, i) => <View key={m.user_id} style={{ width: `${(m.spent / Math.max(view.household_total, 1)) * 100}%`, backgroundColor: [c.bad, c.warn, c.ok, c.ink3][i % 4] }} />)}
              </View>
            </Card>
            <Card style={{ paddingVertical: 4 }}>
              {view.members.map((m, i) => {
                const over = m.budgets.find((b) => b.level === "exceeded");
                return (
                  <View key={m.user_id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, minHeight: 64, borderBottomWidth: i === view.members.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
                    <Avatar name={m.name} size={42} />
                    <View style={{ flex: 1 }}>
                      <T w="bold" size={16}>{m.name}</T>
                      <T size={13} color={over ? c.badInk : c.ink3}>{over ? `${over.category} over` : m.role === "admin" ? "Admin" : "Member"}</T>
                    </View>
                    <T w="black" size={16}>{money(m.spent)}</T>
                  </View>
                );
              })}
            </Card>
            <T w="black" size={17}>Shared budgets</T>
            {view.family_budgets.length === 0 ? <T size={14} color={c.ink3}>No shared budgets yet. Set them from the Budgets tab (Family).</T> : (
              <Card style={{ gap: 18 }}>{view.family_budgets.map((b) => <BudgetBlock key={b.category} b={b} />)}</Card>
            )}
          </>
        )}
      </View>
      <Sheet visible={invite} title="Add a family member" onClose={() => setInvite(false)} actions={<Button kind="lime" label={busy ? "Adding…" : "Add member"} disabled={busy || !f.name || !f.email || f.password.length < 8} onPress={add} />}>
        <Field label="Name" value={f.name} onChangeText={(t) => setF({ ...f, name: t })} />
        <Field label="Email" value={f.email} onChangeText={(t) => setF({ ...f, email: t })} autoCapitalize="none" keyboardType="email-address" />
        <Field label="Temporary password (8+ characters)" value={f.password} onChangeText={(t) => setF({ ...f, password: t })} autoCapitalize="none" secureTextEntry />
        <Segmented value={f.role} onChange={(role) => setF({ ...f, role })} options={[{ value: "member", label: "Member" }, { value: "admin", label: "Admin" }]} />
      </Sheet>
    </Screen>
  );
}

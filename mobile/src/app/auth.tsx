import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Field, GoogleButton, Icon, T } from "@/components/ui";
import * as api from "@/lib/api";
import { useTheme } from "@/lib/theme";

export default function Auth() {
  const { c } = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const { mode: m } = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<"login" | "signup">(m === "login" ? "login" : "signup");
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const login = mode === "login";
  const [google, setGoogle] = useState(false);
  useEffect(() => { api.getAuthConfig().then((x) => setGoogle(x.google)).catch(() => undefined); }, []);

  async function withGoogle() {
    setBusy(true); setError("");
    try { if (await api.googleSignIn()) router.replace("/"); }
    catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); } finally { setBusy(false); }
  }

  async function submit() {
    setBusy(true); setError("");
    try {
      if (login) await api.login(email, password); else await api.register(name, email, password);
      router.replace("/");
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: top + 8, paddingBottom: bottom + 24, paddingHorizontal: 24, gap: 16, flexGrow: 1 }}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Back" style={{ width: 44, height: 44, justifyContent: "center" }}><Icon name="back" /></Pressable>
        <T head w="black" size={38} tight style={{ marginTop: 8 }}>{login ? "Welcome back" : "Create your account"}</T>
        <T size={16} color={c.ink2}>{login ? "Sign in to see your household." : "You’ll be the admin of a new family, and can add members later."}</T>
        {!login && <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" />}
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={login ? "current-password" : "new-password"} />
        {!login && <T size={13} color={c.ink3}>At least 8 characters.</T>}
        {error ? <View style={{ backgroundColor: c.badSoft, borderRadius: 14, padding: 12 }}><T w="bold" size={14} color={c.badInk}>{error}</T></View> : null}
        <Button kind="lime" label={busy ? "Please wait…" : login ? "Sign in" : "Create account"} onPress={submit} disabled={busy || !email || !password || (!login && !name)} />
        {google && <GoogleButton onPress={withGoogle} disabled={busy} />}
        <Pressable onPress={() => setMode(login ? "signup" : "login")} style={{ minHeight: 44, justifyContent: "center", alignItems: "center" }}>
          <T size={15} color={c.ink2}>{login ? "New to FinMate? " : "Already have an account? "}<T w="black" size={15}>{login ? "Create an account" : "Sign in"}</T></T>
        </Pressable>
        {login && (
          <Pressable onPress={() => { setEmail("ravi@finmate.dev"); setPassword("demo1234"); }} style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 14 }}>
            <T size={12.5} color={c.ink3}>Demo: ravi@finmate.dev (admin) or priya@finmate.dev (member), password demo1234. Tap to fill Ravi.</T>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

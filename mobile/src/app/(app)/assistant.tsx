import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Icon, T } from "@/components/ui";
import { F } from "@/components/ui";
import { money } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

const PROMPTS = ["How are my budgets?", "Family spending", "Where can I save money?"];

/** Renders **bold** and "- " bullet lines from the model's reply. */
function Rich({ text, color }: { text: string; color: string }) {
  return (
    <View style={{ gap: 6 }}>
      {text.split("\n").filter((l) => l.trim()).map((line, i) => {
        const bullet = /^\s*[-*•]\s+/.test(line);
        const parts = line.replace(/^\s*[-*•]\s+/, "").split(/(\*\*[^*]+\*\*)/g);
        return (
          <View key={i} style={{ flexDirection: "row", gap: 8 }}>
            {bullet ? <T color={color}>•</T> : null}
            <T size={16} color={color} style={{ flex: 1, lineHeight: 23 }}>
              {parts.map((p, j) => (p.startsWith("**") ? <T key={j} w="black" size={16} color={color}>{p.slice(2, -2)}</T> : p))}
            </T>
          </View>
        );
      })}
    </View>
  );
}

export default function Assistant() {
  const { c } = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const { messages, busy, send, approve, discard } = useSession();
  const [text, setText] = useState("");
  const ref = useRef<ScrollView>(null);
  useEffect(() => { setTimeout(() => ref.current?.scrollToEnd({ animated: true }), 60); }, [messages.length, busy]);
  const go = (t = text) => { if (t.trim() && !busy) { send(t.trim()); setText(""); } };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.bg, paddingTop: top }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, minHeight: 56 }}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Back" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Icon name="back" /></Pressable>
        <T w="black" size={17} style={{ flex: 1, textAlign: "center" }}>Assistant</T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView ref={ref} contentContainerStyle={{ padding: 20, gap: 12, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        {messages.length === 0 ? (
          <View style={{ flex: 1, justifyContent: "center", gap: 8, paddingBottom: 40 }}>
            <T head w="black" size={32} tight>What did you spend?</T>
            <T size={16} color={c.ink2} style={{ lineHeight: 23 }}>Type “spent 120 on chai”, or ask about your budgets, your family’s spending, or where you can save.</T>
          </View>
        ) : null}
        {messages.map((m) => {
          if (m.role !== "proposal") {
          if (m.role === "user") return <View key={m.id} style={{ alignSelf: "flex-end", maxWidth: "85%", backgroundColor: c.lime, borderRadius: 20, borderBottomRightRadius: 6, padding: 14 }}><T w="semi" size={16} color="#121211">{m.text}</T></View>;
          if (m.role === "error") return <View key={m.id} style={{ backgroundColor: c.badSoft, borderRadius: 16, padding: 14 }}><T w="bold" size={15} color={c.badInk}>{m.text}</T></View>;
          if (m.role === "assistant") return <View key={m.id} style={{ alignSelf: "flex-start", maxWidth: "92%", backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: 20, borderBottomLeftRadius: 6, padding: 14 }}><Rich text={m.text} color={c.ink} /></View>;
          return null;
          }
          return (
            <View key={m.id} style={{ backgroundColor: c.card, borderWidth: 2, borderColor: m.state === "pending" ? c.limeInk : c.line, borderRadius: 20, padding: 16, gap: 10 }}>
              <T w="black" size={16}>Confirm this expense</T>
              <T size={15} color={c.ink2}>{money(m.proposal.amount)} · {m.proposal.merchant} · {m.proposal.category}{m.proposal.note ? ` · ${m.proposal.note}` : ""}</T>
              {m.state === "pending" ? (
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Button small kind="lime" label="Approve" onPress={() => approve(m.id)} disabled={busy} style={{ flex: 1 }} />
                  <Button small kind="plain" label="Cancel" onPress={() => discard(m.id)} style={{ flex: 1 }} />
                </View>
              ) : <T w="bold" size={13} color={c.ink3}>{m.state === "done" ? "Saved" : "Discarded"}</T>}
            </View>
          );
        })}
        {busy ? <T w="bold" size={13} color={c.ink3}>Agents working…</T> : null}
      </ScrollView>
      {messages.length === 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingBottom: 10 }}>
          {PROMPTS.map((p) => <Pressable key={p} onPress={() => go(p)} style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 99, justifyContent: "center", backgroundColor: c.card, borderWidth: 1, borderColor: c.border }}><T w="bold" size={14}>{p}</T></Pressable>)}
        </ScrollView>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottom + 10, borderTopWidth: 1, borderTopColor: c.line }}>
        <TextInput value={text} onChangeText={setText} placeholder="Ask anything…" placeholderTextColor={c.ink3} onSubmitEditing={() => go()} returnKeyType="send" editable={!busy}
          style={{ flex: 1, minHeight: 52, borderRadius: 26, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, paddingHorizontal: 18, fontFamily: F.semi, fontSize: 16, color: c.ink }} />
        <Pressable onPress={() => go()} accessibilityLabel="Send" disabled={busy || !text.trim()} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.lime, alignItems: "center", justifyContent: "center", opacity: busy || !text.trim() ? 0.5 : 1 }}>
          <Icon name="send" color="#121211" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

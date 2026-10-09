import { Modal, Pressable, ScrollView, View } from "react-native";
import { KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { Button, T } from "./ui";

/** Bottom sheet used for small forms and pickers. */
export function Sheet({ visible, title, onClose, children, actions }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode; actions?: React.ReactNode }) {
  const { c } = useTheme();
  const { bottom } = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.45)" }} />
        <View style={{ backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "88%", paddingTop: 10 }}>
          <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: c.border, marginBottom: 12 }} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 + bottom, gap: 14 }}>
            <T head w="black" size={26} tight>{title}</T>
            {children}
            {actions}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Options<V extends string | number>({ options, value, onPick }: { options: { value: V; label: string }[]; value: V; onPick: (v: V) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {options.map((o) => (
        <Pressable key={String(o.value)} onPress={() => onPick(o.value)} accessibilityRole="button"
          style={{ minHeight: 52, borderRadius: 14, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            backgroundColor: c.card, borderWidth: o.value === value ? 2 : 1, borderColor: o.value === value ? c.ink : c.line }}>
          <T w="bold" size={16}>{o.label}</T>
          {o.value === value ? <T w="black" color={c.limeInk}>✓</T> : null}
        </Pressable>
      ))}
    </View>
  );
}

export { Button };

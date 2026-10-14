import { Stack } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "@/components/ui";
import { SessionGate, SessionProvider, useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

function Toasts() {
  const { toast } = useSession();
  const { c } = useTheme();
  const { top } = useSafeAreaInsets();
  if (!toast) return null;
  const bg = toast.tone === "bad" ? c.badSoft : toast.tone === "warn" ? c.warnSoft : c.limeSoft;
  const fg = toast.tone === "bad" ? c.badInk : toast.tone === "warn" ? c.warnInk : c.limeInk;
  return (
    <View pointerEvents="none" accessibilityLiveRegion="polite" style={{ position: "absolute", top: top + 8, left: 16, right: 16, zIndex: 50 }}>
      <View style={{ backgroundColor: bg, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: fg + "33" }}>
        <T w="bold" size={14} color={fg}>{toast.text}</T>
      </View>
    </View>
  );
}

export default function AppLayout() {
  const { c } = useTheme();
  return (
    <SessionGate>
      {(user, setUser) => (
        <SessionProvider user={user} setUser={setUser}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="add" options={{ presentation: "modal" }} />
            <Stack.Screen name="confirm" options={{ presentation: "transparentModal", animation: "slide_from_bottom" }} />
            <Stack.Screen name="assistant" />
            <Stack.Screen name="alerts" />
            <Stack.Screen name="settings" />
          </Stack>
          <Toasts />
        </SessionProvider>
      )}
    </SessionGate>
  );
}

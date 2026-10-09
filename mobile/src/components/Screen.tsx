import { RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";

/** Screen body: safe-area top, themed background, optional pull-to-refresh, room for the tab bar. */
export function Screen({ children, tabs, onRefresh, style, scroll = true }: { children: React.ReactNode; tabs?: boolean; onRefresh?: () => Promise<void>; style?: StyleProp<ViewStyle>; scroll?: boolean }) {
  const { c } = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const pad = { paddingBottom: (tabs ? 110 : 24) + (tabs ? 0 : bottom) };
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: c.bg, paddingTop: top }, style]}>{children}</View>;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={[{ paddingTop: top }, pad, style]} showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={busy} tintColor={c.ink3} onRefresh={async () => { setBusy(true); await onRefresh(); setBusy(false); }} /> : undefined}>
      {children}
    </ScrollView>
  );
}

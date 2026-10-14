import { router } from "expo-router";
import { TabList, TabSlot, TabTrigger, Tabs } from "expo-router/ui";
import { forwardRef } from "react";
import { Pressable, View, type PressableProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, T } from "@/components/ui";
import { useTheme } from "@/lib/theme";

type BtnProps = PressableProps & { isFocused?: boolean; label: string; icon: string };
const TabButton = forwardRef<View, BtnProps>(function TabButton({ isFocused, label, icon, ...rest }, ref) {
  const { c } = useTheme();
  return (
    <Pressable ref={ref} {...rest} accessibilityRole="tab" accessibilityState={{ selected: !!isFocused }}
      style={{ flex: 1, alignItems: "center", gap: 4, minHeight: 48 }}>
      <Icon name={icon} size={24} color={isFocused ? c.ink : c.ink3} />
      <T size={11} w={isFocused ? "black" : "semi"} color={isFocused ? c.ink : c.ink3}>{label}</T>
      <View style={{ width: 4, height: 4, borderRadius: 2, marginTop: -1, backgroundColor: isFocused ? c.limeInk : "transparent" }} />
    </Pressable>
  );
});

export default function TabsLayout() {
  const { c } = useTheme();
  const { bottom } = useSafeAreaInsets();
  return (
    <Tabs>
      <TabSlot />
      <TabList style={{ position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "flex-end", paddingTop: 10, paddingBottom: Math.max(bottom, 12),
        backgroundColor: c.tab, borderTopWidth: 1, borderTopColor: c.line }}>
        <TabTrigger name="index" href="/" asChild><TabButton label="Home" icon="home" /></TabTrigger>
        <TabTrigger name="expenses" href="/expenses" asChild><TabButton label="Expenses" icon="list" /></TabTrigger>
        <View style={{ flex: 1 }} />
        <TabTrigger name="budgets" href="/budgets" asChild><TabButton label="Budgets" icon="gauge" /></TabTrigger>
        <TabTrigger name="family" href="/family" asChild><TabButton label="Family" icon="family" /></TabTrigger>
        <Pressable accessibilityRole="button" accessibilityLabel="Add expense" onPress={() => router.push("/add")}
          style={{ position: "absolute", top: -28, left: "50%", marginLeft: -29, width: 58, height: 63, borderRadius: 18, backgroundColor: c.shadow, paddingBottom: 5 }}>
          <View style={{ flex: 1, borderRadius: 18, backgroundColor: c.lime, alignItems: "center", justifyContent: "center" }}>
            <Icon name="plus" size={28} color="#121211" stroke={2.6} />
          </View>
        </Pressable>
      </TabList>
    </Tabs>
  );
}

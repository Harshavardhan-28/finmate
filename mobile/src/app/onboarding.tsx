import { router } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Icon, Meter, T } from "@/components/ui";
import { useTheme } from "@/lib/theme";

export default function Onboarding() {
  const { c } = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: top + 12, paddingBottom: bottom + 16, paddingHorizontal: 24 }}>
      <T head w="black" size={26} tight>finmate<T head w="black" size={26} color={c.limeInk}>.</T></T>
      <View style={{ flex: 1, justifyContent: "center", gap: 14 }}>
        <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: 24, padding: 20, gap: 14 }}>
          <T size={13} color={c.ink3} w="semi">October</T>
          <T head w="black" size={44} tight>₹16,060</T>
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T w="bold" size={14}>Transport</T><T w="black" size={14} color={c.badInk}>112% · over</T></View>
            <Meter pct={100} level="exceeded" height={8} />
          </View>
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T w="bold" size={14}>Food</T><T w="black" size={14} color={c.warnInk}>85%</T></View>
            <Meter pct={85} level="warning" height={8} />
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.badSoft, borderRadius: 18, padding: 14, marginLeft: 28 }}>
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: c.bad, alignItems: "center", justifyContent: "center" }}><Icon name="alert" size={20} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <T w="black" size={14}>Transport is over budget</T>
            <T size={13} color={c.ink3}>Told on the 8th, not the 30th</T>
          </View>
        </View>
      </View>
      <T head w="black" size={44} tight style={{ lineHeight: 46 }}>Know before the money’s gone.</T>
      <T size={17} color={c.ink2} style={{ marginTop: 12, lineHeight: 25 }}>Snap a bill or say what you spent. FinMate keeps the whole family’s budgets in check.</T>
      <View style={{ gap: 12, marginTop: 26 }}>
        <Button kind="lime" label="Get started" onPress={() => router.push("/auth?mode=signup")} />
        <Button kind="plain" label="I already have an account" onPress={() => router.push("/auth?mode=login")} />
      </View>
    </View>
  );
}

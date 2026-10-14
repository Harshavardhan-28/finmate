import { Pressable, StyleSheet, Text as RNText, TextInput, View, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "@/lib/theme";
import type { Level } from "@/lib/types";

export const F = {
  body: "Manrope_500Medium", semi: "Manrope_600SemiBold", bold: "Manrope_700Bold", black: "Manrope_800ExtraBold",
  head: "BricolageGrotesque_700Bold", headBlack: "BricolageGrotesque_800ExtraBold",
};

type TProps = TextProps & { size?: number; w?: "body" | "semi" | "bold" | "black"; head?: boolean; color?: string; tight?: boolean };
/** Text with the app font, text-size preference and theme ink applied. */
export function T({ size = 15, w = "body", head, color, tight, style, ...rest }: TProps) {
  const { c, scale } = useTheme();
  const s = size * (head && size > 30 ? 1 : scale);
  const base: TextStyle = {
    fontFamily: head ? (w === "black" ? F.headBlack : F.head) : F[w], fontSize: s, color: color ?? c.ink,
    ...(head ? { letterSpacing: -s * (tight ? 0.05 : 0.035) } : null),
  };
  return <RNText {...rest} style={[base, style]} />;
}

const PATHS: Record<string, string> = {
  home: "M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  gauge: "M4 19a8 8 0 1 1 16 0M12 19l4-6",
  family: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M17 11a2.5 2.5 0 1 0 0-5M21 20a5 5 0 0 0-4-4.9",
  plus: "M12 5v14M5 12h14",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM6 11a6 6 0 0 0 12 0M12 17v4",
  type: "M4 7V5h16v2M12 5v14M9 19h6",
  chat: "M4 5h16v11H9l-5 4z",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4",
  chevR: "M9 6l6 6-6 6",
  chevD: "M6 9l6 6 6-6",
  back: "M15 6l-6 6 6 6",
  check: "M5 12l4 4 10-10",
  x: "M6 6l12 12M18 6L6 18",
  alert: "M12 8v5M12 17h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  userPlus: "M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM3 21a7 7 0 0 1 14 0M19 8v6M16 11h6",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2L10 21h4l.6-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z",
  filter: "M4 6h16M7 12h10M10 18h4",
  send: "M5 12l14-7-5 14-3-6z",
  flash: "M13 3L5 14h6l-1 7 8-11h-6z",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01",
  trash: "M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
};
export function Icon({ name, size = 22, color, stroke = 1.9 }: { name: keyof typeof PATHS | string; size?: number; color?: string; stroke?: number }) {
  const { c } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? c.ink} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <Path d={PATHS[name] ?? ""} />
    </Svg>
  );
}

export function Card({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const { c } = useTheme();
  return <View style={[{ backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: 18, padding: 16 }, style]}>{children}</View>;
}

type BProps = { label: string; onPress?: () => void; kind?: "lime" | "dark" | "plain" | "danger"; disabled?: boolean; icon?: string; style?: StyleProp<ViewStyle>; small?: boolean };
/** Raised button: a 4px hard edge under the face that presses flat. */
export function Button({ label, onPress, kind = "dark", disabled, icon, style, small }: BProps) {
  const { c } = useTheme();
  const face = kind === "lime" ? c.lime : kind === "dark" ? c.btnBg : kind === "danger" ? c.bad : c.card;
  const fg = kind === "lime" ? "#121211" : kind === "dark" ? c.btnFg : kind === "danger" ? "#fff" : c.ink;
  const edge = kind === "lime" ? c.shadow : kind === "dark" ? c.lime : kind === "danger" ? "#000" : c.border;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => [{ opacity: disabled ? 0.5 : 1, borderRadius: 14, backgroundColor: edge, paddingBottom: pressed ? 1 : 4, marginTop: pressed ? 3 : 0, marginBottom: pressed ? 3 : 0 }, style]}>
      <View style={{ backgroundColor: face, borderRadius: 14, minHeight: small ? 44 : 54, paddingHorizontal: 20, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center",
        borderWidth: kind === "plain" ? 1 : 0, borderColor: c.border }}>
        {icon ? <Icon name={icon} size={20} color={fg} /> : null}
        <T w="black" size={small ? 14 : 16} color={fg}>{label}</T>
      </View>
    </Pressable>
  );
}

/** Google's multi-colour "G" mark. */
export function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

/** "Continue with Google" per Google's branding: neutral surface, thin outline, full-colour G, medium-weight label. */
export function GoogleButton({ onPress, disabled, label = "Continue with Google" }: { onPress?: () => void; disabled?: boolean; label?: string }) {
  const { c } = useTheme(); const dark = c.dark;
  const bg = dark ? "#131314" : "#FFFFFF", line = dark ? "#8E918F" : "#747775", fg = dark ? "#E3E3E3" : "#1F1F1F";
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ opacity: disabled ? 0.5 : 1, minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: line, backgroundColor: pressed ? (dark ? "#1C1C1E" : "#F6F8FC") : bg,
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 16 })}>
      <GoogleG size={20} />
      <RNText style={{ color: fg, fontSize: 16, fontWeight: "500" }}>{label}</RNText>
    </Pressable>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const { c } = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.lime, alignItems: "center", justifyContent: "center" }}>
      <T w="black" size={size * 0.4} color="#121211">{name.slice(0, 1).toUpperCase()}</T>
    </View>
  );
}

export const levelColors = (c: ReturnType<typeof useTheme>["c"], level: Level) =>
  level === "exceeded" ? { bar: c.bad, ink: c.badInk, soft: c.badSoft } : level === "warning" ? { bar: c.warn, ink: c.warnInk, soft: c.warnSoft } : { bar: c.ok, ink: c.limeInk, soft: c.limeSoft };

/** Progress track with the warning-line tick. */
export function Meter({ pct, level, height = 8, tick = 80 }: { pct: number; level: Level; height?: number; tick?: number | null }) {
  const { c } = useTheme();
  const col = levelColors(c, level);
  return (
    <View style={{ height, borderRadius: 9, backgroundColor: c.line, overflow: "hidden" }}>
      <View style={{ width: `${Math.min(100, Math.max(2, pct))}%`, height: "100%", backgroundColor: col.bar, borderRadius: 9 }} />
      {tick ? <View style={{ position: "absolute", left: `${tick}%`, top: 0, bottom: 0, width: 2, backgroundColor: c.card }} /> : null}
    </View>
  );
}

export function Segmented<V extends string>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", backgroundColor: c.hover, borderRadius: 14, padding: 4 }}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="button" accessibilityState={{ selected: o.value === value }}
          style={{ flex: 1, minHeight: 44, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: o.value === value ? c.card : "transparent" }}>
          <T w={o.value === value ? "black" : "semi"} size={15} color={o.value === value ? c.ink : c.ink3}>{o.label}</T>
        </Pressable>
      ))}
    </View>
  );
}

export function Chip({ label, active, dot, onPress }: { label: string; active?: boolean; dot?: string; onPress?: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 99, flexDirection: "row", gap: 8, alignItems: "center",
      backgroundColor: active ? c.btnBg : c.card, borderWidth: 1, borderColor: active ? c.btnBg : c.border }}>
      {dot ? <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: dot }} /> : null}
      <T w="bold" size={14} color={active ? c.btnFg : c.ink}>{label}</T>
    </Pressable>
  );
}

export function Header({ title, sub, left, right }: { title: string; sub?: string; left?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, minHeight: 56 }}>
      {left}
      <View style={{ flex: 1 }}>
        <T head w="black" size={32} tight>{title}</T>
        {sub ? <T size={14} w="semi" color="#8d8c86" style={{ marginTop: 2 }}>{sub}</T> : null}
      </View>
      {right}
    </View>
  );
}

export function RoundBtn({ icon, onPress, label, dot }: { icon: string; onPress: () => void; label: string; dot?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} size={20} />
      {dot ? <View style={{ position: "absolute", top: 9, right: 10, width: 9, height: 9, borderRadius: 5, backgroundColor: c.bad, borderWidth: 2, borderColor: c.card }} /> : null}
    </Pressable>
  );
}

export function Field({ label, ...rest }: { label: string } & React.ComponentProps<typeof TextInput>) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <T w="bold" size={13} color={c.ink3}>{label}</T>
      <TextInput placeholderTextColor={c.ink3} {...rest}
        style={[{ minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, paddingHorizontal: 16, fontFamily: F.semi, fontSize: 16, color: c.ink }, rest.style]} />
    </View>
  );
}

export const hair = StyleSheet.hairlineWidth;

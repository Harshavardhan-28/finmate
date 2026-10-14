import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

export type Palette = typeof light;
const light = {
  dark: false, bg: "#f4f3ee", card: "#ffffff", ink: "#121211", ink2: "#4a4944", ink3: "#6f6e68",
  line: "#e6e4dd", border: "#dddbd3", hover: "#e9e8e2", lime: "#b0e739", limeInk: "#417300", limeSoft: "#e3f7cc",
  warn: "#f0b135", warnInk: "#945a00", warnSoft: "#feedc9", bad: "#de3c37", badInk: "#c51e21", badSoft: "#ffe6e3",
  ok: "#92ce14", tab: "rgba(255,255,255,0.94)", shadow: "#121211", btnBg: "#121211", btnFg: "#f4f3ee",
};
const dark: Palette = {
  dark: true, bg: "#0e0e0d", card: "#171716", ink: "#f2f1ec", ink2: "#b9b8b1", ink3: "#8d8c86",
  line: "#262624", border: "#2c2c2a", hover: "#1f1f1d", lime: "#bbec4c", limeInk: "#bbec4c", limeSoft: "#222d11",
  warn: "#f8c655", warnInk: "#f8c655", warnSoft: "#37290a", bad: "#fc5855", badInk: "#ff6a65", badSoft: "#3f1917",
  ok: "#bbec4c", tab: "rgba(23,23,22,0.94)", shadow: "#607e15", btnBg: "#f2f1ec", btnFg: "#0e0e0d",
};

export type Appearance = "system" | "light" | "dark";
export type TextSize = "normal" | "large";
type Ctx = {
  c: Palette; appearance: Appearance; setAppearance: (a: Appearance) => void;
  textSize: TextSize; setTextSize: (t: TextSize) => void; scale: number;
};
const ThemeCtx = createContext<Ctx>(null as never);
export const useTheme = () => useContext(ThemeCtx);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [appearance, setAp] = useState<Appearance>("system");
  const [textSize, setTs] = useState<TextSize>("normal");
  useEffect(() => {
    SecureStore.getItemAsync("finmate_prefs").then((v) => {
      if (!v) return;
      try { const p = JSON.parse(v); if (p.appearance) setAp(p.appearance); if (p.textSize) setTs(p.textSize); } catch { /* ignore */ }
    }).catch(() => undefined);
  }, []);
  const persist = useCallback((appearance: Appearance, textSize: TextSize) => {
    SecureStore.setItemAsync("finmate_prefs", JSON.stringify({ appearance, textSize })).catch(() => undefined);
  }, []);
  const value = useMemo<Ctx>(() => ({
    c: (appearance === "system" ? system === "dark" : appearance === "dark") ? dark : light,
    appearance, textSize, scale: textSize === "large" ? 1.12 : 1,
    setAppearance: (a) => { setAp(a); persist(a, textSize); },
    setTextSize: (t) => { setTs(t); persist(appearance, t); },
  }), [appearance, textSize, system, persist]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

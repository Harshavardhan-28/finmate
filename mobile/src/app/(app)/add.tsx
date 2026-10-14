import { CameraView, useCameraPermissions } from "expo-camera";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Chip, Field, Icon, Segmented, T } from "@/components/ui";
import * as api from "@/lib/api";
import { CATEGORIES, catColor, catShort, todayIso } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

type Tab = "scan" | "speak" | "type";
const TABS = [{ value: "scan" as Tab, label: "Scan" }, { value: "speak" as Tab, label: "Speak" }, { value: "type" as Tab, label: "Type" }];

export default function Add() {
  const { c } = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const p = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(p.tab === "speak" || p.tab === "type" ? p.tab : "scan");
  const { capturing } = useSession();
  const dark = tab === "scan";
  return (
    <View style={{ flex: 1, backgroundColor: dark ? "#000" : c.bg, paddingTop: top }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, minHeight: 56 }}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Close" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Icon name="x" color={dark ? "#fff" : c.ink} /></Pressable>
        <T w="black" size={17} color={dark ? "#fff" : c.ink} style={{ flex: 1, textAlign: "center" }}>{dark ? "Fit the whole receipt" : "Add expense"}</T>
        <View style={{ width: 44 }} />
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}><Segmented value={tab} onChange={setTab} options={TABS} /></View>
      {tab === "scan" ? <Scan /> : tab === "speak" ? <Speak /> : <TypeIt />}
      {capturing ? (
        <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", gap: 14, paddingBottom: bottom }}>
          <ActivityIndicator color="#fff" size="large" />
          <T w="bold" size={16} color="#fff">Reading it…</T>
        </View>
      ) : null}
    </View>
  );
}

function Scan() {
  const { bottom } = useSafeAreaInsets();
  const { capture } = useSession();
  const [perm, ask] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [flash, setFlash] = useState(false);

  async function shoot() {
    const pic = await cam.current?.takePictureAsync({ quality: 0.7 });
    if (pic) void capture(pic.uri, "receipt.jpg", "image/jpeg", "receipt");
  }
  async function pick() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    const a = r.assets?.[0];
    if (a) void capture(a.uri, a.fileName ?? "receipt.jpg", a.mimeType ?? "image/jpeg", "receipt");
  }
  if (!perm?.granted) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 }}>
        <T w="black" size={20} color="#fff" style={{ textAlign: "center" }}>Allow the camera to scan receipts</T>
        <Button kind="lime" label="Allow camera" onPress={ask} />
        <Button kind="plain" label="Choose from photos" onPress={pick} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <CameraView ref={cam} style={{ flex: 1 }} facing="back" enableTorch={flash} />
      <View pointerEvents="none" style={{ position: "absolute", top: 20, bottom: 150, left: 36, right: 36, borderWidth: 3, borderColor: "#b0e739", borderRadius: 22, opacity: 0.9 }} />
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: bottom + 20, paddingTop: 16, flexDirection: "row", justifyContent: "space-around", alignItems: "center", backgroundColor: "rgba(0,0,0,0.45)" }}>
        <Pressable onPress={pick} accessibilityLabel="Choose from photos" style={{ width: 52, height: 52, borderRadius: 14, borderWidth: 2, borderColor: "#fff", alignItems: "center", justifyContent: "center" }}><Icon name="image" color="#fff" /></Pressable>
        <Pressable onPress={shoot} accessibilityLabel="Take photo" style={{ width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: "#fff", alignItems: "center", justifyContent: "center" }}><View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: "#b0e739" }} /></Pressable>
        <Pressable onPress={() => setFlash(!flash)} accessibilityLabel="Torch" style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: flash ? "#b0e739" : "#fff", alignItems: "center", justifyContent: "center" }}><Icon name="flash" color={flash ? "#b0e739" : "#fff"} /></Pressable>
      </View>
    </View>
  );
}

function Speak() {
  const { c } = useTheme();
  const { capture } = useSession();
  const rec = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(rec);
  const [level, setLevel] = useState<number[]>(Array(13).fill(0.2));

  useEffect(() => {
    if (!state.isRecording) return;
    const t = setInterval(() => setLevel(Array.from({ length: 13 }, () => 0.15 + Math.random() * 0.85)), 140);
    return () => clearInterval(t);
  }, [state.isRecording]);

  async function toggle() {
    if (state.isRecording) {
      await rec.stop();
      if (rec.uri) void capture(rec.uri, "voice.m4a", "audio/m4a", "voice");
      return;
    }
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) return Alert.alert("Microphone is off", "Allow the microphone in Settings to add expenses by voice.");
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await rec.prepareToRecordAsync();
    rec.record();
  }
  return (
    <View style={{ flex: 1, alignItems: "center", paddingHorizontal: 24, paddingTop: 16, gap: 18 }}>
      <T w="semi" size={16} color={c.ink3}>{state.isRecording ? "Listening… speak in Hindi or English" : "Tap the mic and say what you spent"}</T>
      <T head w="black" size={28} tight style={{ textAlign: "center", minHeight: 70 }}>“Spent 450 on cab from home to office”</T>
      <View style={{ flexDirection: "row", gap: 6, alignItems: "center", height: 80 }}>
        {level.map((h, i) => <View key={i} style={{ width: 7, height: 10 + h * 66, borderRadius: 4, backgroundColor: state.isRecording ? c.limeInk : c.border }} />)}
      </View>
      <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={state.isRecording ? "Stop recording" : "Start recording"}
        style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: state.isRecording ? c.bad : c.lime, alignItems: "center", justifyContent: "center" }}>
        <Icon name={state.isRecording ? "check" : "mic"} size={36} color={state.isRecording ? "#fff" : "#121211"} />
      </Pressable>
      <T w="bold" size={14} color={c.ink3}>{state.isRecording ? "Tap when you’re done" : "Tap to start"}</T>
      <View style={{ gap: 8, alignItems: "center", marginTop: 8 }}>
        <T w="black" size={12} color={c.ink3} style={{ textTransform: "uppercase", letterSpacing: 1 }}>Try saying</T>
        {["“Groceries 1,850 BigBasket”", "“Doodh ke liye 60 rupaye”"].map((s) => <View key={s} style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8 }}><T w="semi" size={14}>{s}</T></View>)}
      </View>
    </View>
  );
}

function TypeIt() {
  const { c } = useTheme();
  const { refresh } = useSession();
  const [f, setF] = useState({ amount: "", category: "Food", merchant: "", note: "", date: todayIso() });
  const [busy, setBusy] = useState(false);
  const n = Number(f.amount.replace(/[^0-9.]/g, ""));
  async function save() {
    setBusy(true);
    try {
      const r = await api.addExpense({ amount: n, date: f.date, merchant: f.merchant.trim(), category: f.category, note: f.note.trim() });
      await refresh();
      const worst = r.alerts[0];
      router.back();
      if (worst) setTimeout(() => Alert.alert(worst.level === "exceeded" ? "Over budget" : "Near limit", worst.message), 350);
    } catch (e) { Alert.alert("Couldn’t save", e instanceof Error ? e.message : ""); } finally { setBusy(false); }
  }
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 18 }}>
      <View style={{ gap: 6 }}>
        <T w="bold" size={13} color={c.ink3}>Amount</T>
        <Field label="" value={f.amount} onChangeText={(t) => setF({ ...f, amount: t })} keyboardType="decimal-pad" placeholder="₹0" style={{ fontFamily: "BricolageGrotesque_800ExtraBold", fontSize: 44, minHeight: 72 }} />
      </View>
      <View style={{ gap: 8 }}>
        <T w="bold" size={13} color={c.ink3}>Category</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {CATEGORIES.map((k) => <Chip key={k} label={catShort(k)} dot={catColor(k)} active={f.category === k} onPress={() => setF({ ...f, category: k })} />)}
        </View>
      </View>
      <Field label="Merchant" value={f.merchant} onChangeText={(t) => setF({ ...f, merchant: t })} placeholder="Uber" />
      <Field label="Date (YYYY-MM-DD)" value={f.date} onChangeText={(t) => setF({ ...f, date: t })} />
      <Field label="Note" value={f.note} onChangeText={(t) => setF({ ...f, note: t })} placeholder="Home to Office" />
      <Button kind="lime" label={busy ? "Saving…" : "Save expense"} disabled={busy || !n || !f.merchant.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(f.date)} onPress={save} />
    </ScrollView>
  );
}

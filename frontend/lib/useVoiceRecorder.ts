"use client";
import { useRef, useState } from "react";
import { blobToWav } from "./audio";

/** Microphone recording that hands back a 16 kHz mono WAV (what Gemini accepts). */
export function useVoiceRecorder(onWav: (wav: Blob) => void) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  async function toggle() {
    setError("");
    if (recording) {
      recorder.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => chunks.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        try {
          onWav(await blobToWav(new Blob(chunks.current, { type: rec.mimeType })));
        } catch {
          setError("Could not read the recording. Try again or upload a WAV/MP3 file.");
        }
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
    } catch {
      setError("Microphone blocked. Allow mic access in the browser, or upload an audio file.");
    }
  }

  return { recording, error, toggle };
}

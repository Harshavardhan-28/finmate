"use client";
import { useId, useState } from "react";
import { toast } from "sonner";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="fld">
      <span className="fld-label">{label}</span>
      {children}
      {hint && <span className="fld-hint">{hint}</span>}
    </label>
  );
}

export function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  const id = useId();
  return (
    <span className="pwwrap">
      <input {...props} id={id} type={show ? "text" : "password"} />
      <button type="button" className="pwtoggle" aria-pressed={show} aria-controls={id} onClick={() => setShow((v) => !v)}>
        {show ? "Hide" : "Show"}
      </button>
    </span>
  );
}

export function Notice({ tone, children }: { tone: "ok" | "bad" | "info"; children: React.ReactNode }) {
  return <div className={`notice ${tone}`} role={tone === "bad" ? "alert" : "status"}>{children}</div>;
}

/** Runs an async action and reports busy/error/ok state, so forms stay small. */
export function useAction<A extends unknown[]>(fn: (...a: A) => Promise<unknown>, okMessage?: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const run = async (...a: A) => {
    setBusy(true); setError(""); setOk("");
    try {
      await fn(...a);
      if (okMessage) { setOk(okMessage); toast.success(okMessage); }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, error, ok };
}

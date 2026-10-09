"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import { Field, Notice, PasswordInput, useAction } from "@/components/ui";
import { getAuthConfig, getMe, googleLoginUrl, login, register } from "@/lib/api";

function Form({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const dest = next && next.startsWith("/app") ? next : "/app";
  const isLogin = mode === "login";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [google, setGoogle] = useState(false);
  const submit = useAction(async () => {
    if (isLogin) await login(email, password);
    else await register(name, email, password);
    router.replace(dest);
  });

  useEffect(() => {
    getAuthConfig().then((c) => setGoogle(c.google)).catch(() => undefined);
    getMe().then(() => router.replace(dest)).catch(() => undefined);
  }, [router, dest]);

  return (
    <form className="authform" onSubmit={(e) => { e.preventDefault(); void submit.run(); }}>
      <h1>{isLogin ? "Welcome back" : "Create your account"}</h1>
      <p className="muted-lg">{isLogin ? "Sign in to see your household." : "You'll be the admin of a new family, and can add members later."}</p>
      {params.get("auth_error") && <Notice tone="bad">Google sign-in didn&apos;t complete. Try again, or use your email.</Notice>}
      {!isLogin && (
        <Field label="Your name"><input required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      )}
      <Field label="Email"><input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Password" hint={isLogin ? undefined : "At least 8 characters."}>
        <PasswordInput required minLength={isLogin ? undefined : 8} autoComplete={isLogin ? "current-password" : "new-password"}
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {submit.error && <Notice tone="bad">{submit.error}</Notice>}
      <button className="btn primary lg" disabled={submit.busy}>{submit.busy ? "Please wait…" : isLogin ? "Sign in" : "Create account"}</button>
      {google && (
        <>
          <div className="or"><span>or</span></div>
          <a className="gbtn" href={googleLoginUrl}>
            <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            <span>Continue with Google</span>
          </a>
        </>
      )}
      <p className="switch">
        {isLogin ? <>New to FinMate? <Link href="/signup" className="textlink">Create an account</Link></>
          : <>Already have an account? <Link href="/login" className="textlink">Sign in</Link></>}
      </p>
      {isLogin && <p className="hint">Demo: <code>ravi@finmate.dev</code> (admin) or <code>priya@finmate.dev</code> (member), password <code>demo1234</code>.</p>}
    </form>
  );
}

export default function AuthPage({ mode }: { mode: "login" | "signup" }) {
  return (
    <div className="authsplit">
      <div className="authmain">
        <div className="authtop"><Link href="/" className="brand">finmate<span>.</span></Link><ThemeToggle /></div>
        <Suspense><Form mode={mode} /></Suspense>
      </div>
      <aside className="authside" aria-hidden>
        <div className="authalert">
          <span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v5M12 17h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg></span>
          <div><b>Transport is at 112%</b><small>₹8,960 of ₹8,000 · 8 Oct</small></div>
        </div>
        <blockquote><p>The kind of message you want on the 8th, not the 30th.</p></blockquote>
        <ul>
          <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>Photograph a receipt, speak a note, or type it</li>
          <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>Personal and family budgets with early alerts</li>
          <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>Admin and member roles for the household</li>
        </ul>
      </aside>
    </div>
  );
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import { useApp } from "./AppProvider";

const I = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const NAV = [
  { href: "/app", label: "Overview", icon: I("M4 13h6V4H4zM14 20h6V11h-6zM4 20h6v-4H4zM14 7h6V4h-6z") },
  { href: "/app/expenses", label: "Expenses", icon: I("M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01") },
  { href: "/app/receipts", label: "Receipts", icon: I("M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6") },
  { href: "/app/budgets", label: "Budgets", icon: I("M4 19a8 8 0 1 1 16 0M12 19l4-6") },
  { href: "/app/family", label: "Family", icon: I("M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M17 11a2.5 2.5 0 1 0 0-5M21 20a5 5 0 0 0-4-4.9") },
  { href: "/app/assistant", label: "Assistant", icon: I("M4 5h16v11H9l-5 4z") },
  { href: "/app/settings", label: "Settings", icon: I("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2L10 21h4l.6-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z") },
];

const isActive = (href: string, path: string) => (href === "/app" ? path === "/app" : path.startsWith(href));

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { user, health, offline, logout } = useApp();
  const current = NAV.find((n) => isActive(n.href, path));
  return (
    <div className="appshell">
      <aside className="side">
        <Link href="/" className="brand" aria-label="FinMate home">finmate<span>.</span></Link>
        <nav className="nav" aria-label="App">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={isActive(n.href, path) ? "page" : undefined}>
              {n.icon}{n.label}{n.href === "/app/assistant" && <span className="ai">AI</span>}
            </Link>
          ))}
        </nav>
        <div className="side-foot">
          <div className="me-row">
            <span className="avatar" aria-hidden>{user.name.slice(0, 1).toUpperCase()}</span>
            <div className="me">
              <b title={user.name}>{user.name}</b>
              <span>{user.role === "admin" ? "Family admin" : "Family member"}</span>
              <span className="me-email" title={user.email ?? undefined}>{user.email}</span>
            </div>
          </div>
          <button className="btn sm signout" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <div className="appmain">
        <div className="apptop">
          <span className="crumb">{current?.label ?? "App"}</span>
          <span className="spacer" />
          {offline ? (
            <span className="chip bad">Backend offline</span>
          ) : health && !health.llm_configured ? (
            <span className="chip warn">No Gemini key</span>
          ) : null}
          <ThemeToggle />
          <Link href="/app/receipts" className="btn lime sm">Scan a receipt</Link>
        </div>
        {children}
      </div>
    </div>
  );
}

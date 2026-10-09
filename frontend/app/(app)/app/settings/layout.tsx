"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/app/settings", label: "Profile" },
  { href: "/app/settings/security", label: "Security" },
  { href: "/app/settings/preferences", label: "Preferences" },
  { href: "/app/settings/data", label: "Your data" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Settings</h1>
        </div>
      </header>
      <nav className="settings-nav" aria-label="Settings">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} aria-current={path === t.href ? "page" : undefined}>{t.label}</Link>
        ))}
      </nav>
      <div>{children}</div>
    </div>
  );
}

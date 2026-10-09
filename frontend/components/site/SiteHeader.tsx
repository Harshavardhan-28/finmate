"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

const LINKS = [
  { href: "/features", label: "Features" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/security", label: "Security" },
  { href: "/about", label: "About" },
];

export default function SiteHeader() {
  const path = usePathname();
  return (
    <header className="sitehead">
      <div className="wrap sitehead-in">
        <Link href="/" className="brand" aria-label="FinMate home">finmate<span>.</span></Link>
        <nav className="sitenav" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}>{l.label}</Link>
          ))}
        </nav>
        <div className="sitehead-cta">
          <ThemeToggle />
          <Link href="/login" className="signin">Sign in</Link>
          <Link href="/signup" className="btn primary">Get FinMate</Link>
        </div>
      </div>
    </header>
  );
}

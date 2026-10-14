import Link from "next/link";

const COLS = [
  { title: "Product", links: [["/features", "Features"], ["/how-it-works", "How it works"]] },
  { title: "Trust", links: [["/security", "Security & privacy"], ["/about", "About FinMate"]] },
  { title: "Account", links: [["/login", "Sign in"], ["/signup", "Create account"]] },
];

export default function SiteFooter() {
  return (
    <footer className="sitefoot">
      <div className="wrap foot-in">
        <div className="foot-brand">
          <Link href="/" className="brand">finmate<span>.</span></Link>
          <p>A team of AI agents that records household spending, watches your budgets, and speaks up before a limit is crossed.</p>
        </div>
        {COLS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2>{c.title}</h2>
            {c.links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
          </nav>
        ))}
      </div>
      <div className="wrap foot-base">
        <span>© {new Date().getFullYear()} FinMate AI</span>
        <span>Does not connect to your bank or move money.</span>
      </div>
    </footer>
  );
}

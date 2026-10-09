import Link from "next/link";
import { AlertShot, BudgetShot, CaptureShot, HouseholdShot, InsightShot } from "@/components/site/Shots";

const PROBLEMS = [
  ["Spending is scattered", "Money leaves through UPI, cards and cash, from several people. Paper receipts fade, and small cash spends rarely get written down."],
  ["Typing every expense is tedious", "Most people give up on a tracker within weeks. Forms are especially hard for older family members."],
  ["Nobody is watching until month end", "Budgets get checked when someone remembers to open an app, so the warning arrives after the damage."],
];

const AGENTS = [
  ["Orchestrator", "Takes every request, plans the steps, and combines the answers into one reply."],
  ["Receipt Agent", "Turns a photo, a voice note or a form into a clean expense and asks you to confirm."],
  ["Budget Agent", "Compares spending with limits and raises alerts at your warning line and at 100%."],
  ["Family Agent", "Gives admins the household view and enforces who can see what."],
  ["Insights Agent", "Finds repeat habits in your own history and suggests cheaper alternatives."],
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="hero-top">
            <p className="pill"><i />Built for Indian households · ₹, UPI and cash</p>
            <h1>Know before the money&apos;s gone.</h1>
            <p className="lede">
              Snap a receipt or just say what you spent. FinMate files it, checks every budget, and tells the family at 80%,
              not after 100%.
            </p>
            <div className="cta-row">
              <Link href="/signup" className="btn lime lg">Create a free account</Link>
              <Link href="/how-it-works" className="btn lg">See how it works</Link>
            </div>
            <p className="fine">On the web, iPhone and Android. No bank linking.</p>
          </div>
          <div className="hero-visual">
            <CaptureShot />
            <BudgetShot />
            <AlertShot />
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <p className="eyebrow">The problem</p>
          <h2 className="h2">Households don&apos;t overspend on purpose. They just can&apos;t see it happening.</h2>
          <ol className="numlist">
            {PROBLEMS.map(([t, d], i) => (
              <li key={t}>
                <span className="num">{String(i + 1).padStart(2, "0")}</span>
                <div><h3>{t}</h3><p>{d}</p></div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="band alt">
        <div className="wrap feature">
          <div>
            <p className="eyebrow">Capture</p>
            <h2 className="h2">Three ways to log an expense. One step to confirm.</h2>
            <ul className="ticks">
              <li><b>Photograph a receipt.</b> Amount, date, merchant and category are read for you.</li>
              <li><b>Say it.</b> &ldquo;Spent 450 on cab&rdquo; becomes a structured expense.</li>
              <li><b>Or enter the whole bill.</b> Add each item with its own category; they&apos;re stored together as one bill.</li>
            </ul>
            <p>Nothing is saved until you check the fields and confirm. Anything the agent is unsure about is highlighted.</p>
            <Link href="/features#capture" className="textlink">How capture works →</Link>
          </div>
          <CaptureShot />
        </div>
      </section>

      <section className="band">
        <div className="wrap feature flip">
          <div>
            <p className="eyebrow">Budgets and alerts</p>
            <h2 className="h2">Warned at 80%. Told again at 100%.</h2>
            <p>
              Set a monthly limit per category, for yourself or for the whole family. Every time an expense is saved the
              Budget Agent checks where you stand, and an alert appears the moment a line is crossed, once, not on every
              purchase after.
            </p>
            <p>Prefer an earlier nudge? The warning line is yours to move between 50% and 95%.</p>
            <Link href="/features#budgets" className="textlink">About budgets →</Link>
          </div>
          <BudgetShot />
        </div>
      </section>

      <section className="band alt">
        <div className="wrap feature">
          <div>
            <p className="eyebrow">Family</p>
            <h2 className="h2">One household, two roles.</h2>
            <div className="roles">
              <div>
                <h3>Admin</h3>
                <ul><li>Sees the household total and each member&apos;s spend</li><li>Sets shared family budgets</li><li>Adds, promotes and removes members</li></ul>
              </div>
              <div>
                <h3>Member</h3>
                <ul><li>Logs and manages their own expenses and budgets</li><li>Sees shared family budgets</li><li>Cannot see anyone else&apos;s spending</li></ul>
              </div>
            </div>
            <Link href="/security" className="textlink">How access is enforced →</Link>
          </div>
          <HouseholdShot />
        </div>
      </section>

      <section className="band">
        <div className="wrap feature flip">
          <div>
            <p className="eyebrow">Insights</p>
            <h2 className="h2">Advice that comes from your own spending.</h2>
            <p>
              Generic tips don&apos;t change habits. The Insights Agent looks at what you actually bought, finds repeats like a
              daily cab on the same route, and suggests a specific cheaper option you can act on.
            </p>
            <Link href="/features#insights" className="textlink">About insights →</Link>
          </div>
          <InsightShot />
        </div>
      </section>

      <section className="band alt">
        <div className="wrap">
          <p className="eyebrow">Under the hood</p>
          <h2 className="h2">Five agents, each with one job.</h2>
          <ul className="agents">
            {AGENTS.map(([n, d]) => (
              <li key={n}><h3>{n}</h3><p>{d}</p></li>
            ))}
          </ul>
          <Link href="/how-it-works" className="textlink">See how they work together →</Link>
        </div>
      </section>

      <section className="closing">
        <div className="wrap">
          <div>
          <h2>Start with this week&apos;s receipts.</h2>
          <p>Create an account, photograph one receipt, and see the whole loop: capture, confirm, budget check, alert.</p></div>
          <div className="cta-row">
            <Link href="/signup" className="btn primary lg">Create an account</Link>
            <Link href="/login" className="btn lg">Sign in</Link>
          </div>
        </div>
      </section>
    </>
  );
}

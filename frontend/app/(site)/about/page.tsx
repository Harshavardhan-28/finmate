import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description: "Why FinMate exists: households need a record of where money goes, and a watcher that speaks up in time.",
};

export default function About() {
  return (
    <>
      <section className="pagehead">
        <div className="wrap">
          <p className="eyebrow">About FinMate</p>
          <h1>Most expense apps record. FinMate also watches.</h1>
          <p className="lede">
            It started from a simple observation: families notice overspending at month end, when it&apos;s too late to change
            anything.
          </p>
        </div>
      </section>

      <section className="band">
        <div className="wrap two">
          <div>
            <p className="eyebrow">The problem</p>
            <h2 className="h2">No single record, no early warning.</h2>
            <p>
              Money leaves a household through UPI, cards and cash, spent by several people. Receipts get lost and small cash
              purchases go unwritten. Existing tools are built for one person, show charts rather than advice, and only help if
              someone remembers to open them.
            </p>
          </div>
          <div>
            <p className="eyebrow">The idea</p>
            <h2 className="h2">Agents that act without being asked.</h2>
            <p>
              Instead of a passive tracker, FinMate is a small team of AI agents. One captures expenses, one watches budgets,
              one manages the family, and one looks for habits worth changing. They share a memory, so a saved receipt can
              immediately trigger a budget check, an alert, and a suggestion.
            </p>
          </div>
        </div>
      </section>

      <section className="band alt">
        <div className="wrap">
          <p className="eyebrow">What we noticed in the research</p>
          <h2 className="h2">A gap between reading receipts and advising households.</h2>
          <p className="prose">
            A review of the literature found strong work on extracting data from receipts, and apps that track one person&apos;s
            spending with charts and alerts. Studies of language models giving financial advice found them unreliable unless
            grounded in the person&apos;s own data. Few systems combined several input modes, shared family budgets and
            advice built from the user&apos;s history, so FinMate was designed to do all three.
          </p>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <p className="eyebrow">Principles</p>
          <h2 className="h2">How we decide what to build.</h2>
          <ul className="claims">
            <li><h3>People confirm, agents propose</h3><p>Anything extracted by a model is reviewed by a human before it counts.</p></li>
            <li><h3>Advice cites your numbers</h3><p>Suggestions refer to what you actually spent, never generic tips or investment advice.</p></li>
            <li><h3>Small, honest scope</h3><p>No bank linking, no payments, no native apps. Better to do household spending well.</p></li>
          </ul>
        </div>
      </section>

      <section className="closing">
        <div className="wrap">
          <div>
          <h2>Try it with your own household.</h2></div>
          <div className="cta-row">
            <Link href="/signup" className="btn primary lg">Create an account</Link>
            <Link href="/features" className="btn lg">See features</Link>
          </div>
        </div>
      </section>
    </>
  );
}

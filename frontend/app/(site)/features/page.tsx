import type { Metadata } from "next";
import Link from "next/link";
import { BudgetShot, CaptureShot, HouseholdShot, InsightShot, LedgerShot } from "@/components/site/Shots";

export const metadata: Metadata = {
  title: "Features",
  description: "Capture by receipt, voice or form; personal and family budgets with early alerts; admin and member roles; advice from your own spending.",
};

export default function Features() {
  return (
    <>
      <section className="pagehead">
        <div className="wrap">
          <p className="eyebrow">Features</p>
          <h1>Everything FinMate does, and what it deliberately doesn&apos;t.</h1>
          <p className="lede">Five jobs, each handled by an agent that owns it: capturing, budgeting, sharing, advising, and keeping your data yours.</p>
        </div>
      </section>

      <section className="band" id="capture">
        <div className="wrap feature">
          <div>
            <p className="eyebrow">01 · Capture</p>
            <h2 className="h2">From a receipt, a sentence, or a form.</h2>
            <p>The Receipt Agent turns any of three inputs into the same clean record and always asks before saving.</p>
            <dl className="defs">
              <dt>Receipt photo</dt><dd>A vision-capable Gemini model reads the image and proposes the amount, date, merchant and category.</dd>
              <dt>Voice note</dt><dd>Speak naturally: &ldquo;spent 450 on cab&rdquo;. The same model transcribes it and fills in the fields.</dd>
              <dt>Bill form</dt><dd>One bill, any number of items. Each item has its own category (a supermarket bill can be Groceries and Health), and they are stored together so the bill is easy to find and delete as one.</dd>
              <dt>Confirm step</dt><dd>Unsure fields are highlighted so you fix them before they reach your budgets.</dd>
            </dl>
          </div>
          <CaptureShot />
        </div>
      </section>

      <section className="band alt" id="budgets">
        <div className="wrap feature flip">
          <div>
            <p className="eyebrow">02 · Budgets</p>
            <h2 className="h2">Limits that speak up early.</h2>
            <dl className="defs">
              <dt>Per category</dt><dd>Transport, Food, Groceries, Shopping, Entertainment, Utilities, Health and Other.</dd>
              <dt>Personal and family</dt><dd>Everyone has their own limits; the admin sets shared ones for the household.</dd>
              <dt>Two alerts, not twenty</dt><dd>One at your warning line (80% by default), one at 100%. No repeat alerts once a line is already crossed.</dd>
              <dt>Your warning line</dt><dd>Move it anywhere from 50% to 95% in Preferences.</dd>
            </dl>
          </div>
          <BudgetShot />
        </div>
      </section>

      <section className="band" id="expenses">
        <div className="wrap feature">
          <div>
            <p className="eyebrow">03 · Ledger</p>
            <h2 className="h2">Every expense, searchable.</h2>
            <dl className="defs">
              <dt>Grouped by day</dt><dd>With a daily subtotal so a heavy day stands out. A bill appears as one entry you can expand to see its items.</dd>
              <dt>Filter and search</dt><dd>By date range, category, merchant or note.</dd>
              <dt>Where it came from</dt><dd>Each row shows whether it was a receipt, a voice note or a form entry.</dd>
              <dt>Yours to remove</dt><dd>Delete an entry, or a whole bill with all its items, if you recorded it by mistake. Budgets update immediately.</dd>
            </dl>
          </div>
          <LedgerShot />
        </div>
      </section>

      <section className="band alt" id="family">
        <div className="wrap feature flip">
          <div>
            <p className="eyebrow">04 · Family</p>
            <h2 className="h2">A shared view with real boundaries.</h2>
            <dl className="defs">
              <dt>Household view</dt><dd>Admins see the combined total, each member&apos;s spend, and which member crossed a limit.</dd>
              <dt>Member privacy</dt><dd>Members see only their own spending plus the shared family budgets.</dd>
              <dt>Manage the household</dt><dd>Admins create logins for members, change roles, and remove people. A family always keeps at least one admin.</dd>
            </dl>
          </div>
          <HouseholdShot />
        </div>
      </section>

      <section className="band" id="insights">
        <div className="wrap feature">
          <div>
            <p className="eyebrow">05 · Insights</p>
            <h2 className="h2">Specific, local, and based on you.</h2>
            <p>
              The Insights Agent reads your last 30 days, looks for repeated purchases, and proposes a concrete swap, such as the
              metro instead of a cab or cooking instead of ordering in. It remembers past advice so it doesn&apos;t repeat itself.
            </p>
          </div>
          <InsightShot />
        </div>
      </section>

      <section className="band alt" id="control">
        <div className="wrap">
          <p className="eyebrow">06 · Your data</p>
          <h2 className="h2">Yours to take, change or delete.</h2>
          <ul className="agents three">
            <li><h3>Export</h3><p>Download every expense as a CSV any time.</p></li>
            <li><h3>Preferences</h3><p>Choose your display currency and where warnings start.</p></li>
            <li><h3>Delete</h3><p>Remove your account and everything attached to it, permanently.</p></li>
          </ul>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <p className="eyebrow">Not included</p>
          <h2 className="h2">What FinMate leaves out on purpose.</h2>
          <ul className="ticks cross">
            <li><b>Bank or UPI account linking.</b> You record what you spend; nothing connects to your accounts.</li>
            <li><b>Payments.</b> FinMate never moves money.</li>
            <li><b>Investment advice.</b> It sticks to day-to-day household spending.</li>
            <li><b>Native mobile apps.</b> It runs in the browser, on your phone too.</li>
          </ul>
        </div>
      </section>

      <section className="closing">
        <div className="wrap">
          <div>
          <h2>See it with your own receipts.</h2></div>
          <div className="cta-row"><Link href="/signup" className="btn primary lg">Create an account</Link></div>
        </div>
      </section>
    </>
  );
}

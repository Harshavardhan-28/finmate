import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Security & privacy",
  description: "How FinMate protects accounts and household data, what is shared with the AI model, and what it does not do yet.",
};

const PROTECTIONS = [
  ["Passwords are hashed", "Stored as bcrypt hashes. FinMate never stores or returns your password, and logins take the same time whether or not an email exists."],
  ["Sessions you can revoke", "You stay signed in with a signed token held in an httpOnly cookie that scripts on the page cannot read. Changing your password, or choosing Sign out everywhere, invalidates every other session."],
  ["Roles are enforced on the server", "Admin-only actions are checked by the API and by the Family Agent, not hidden in the interface. A member who calls an admin endpoint directly is refused."],
  ["Your spending is yours", "Every request is tied to the signed-in account. Members cannot read anyone else's expenses; only a family admin sees household totals."],
  ["Agents get only their own tools", "Each agent is shown a fixed subset of tools over the Model Context Protocol. The Receipt Agent cannot change budgets, and the Insights Agent cannot save expenses."],
  ["You can leave with your data", "Export every expense as CSV, or delete your account and the data attached to it permanently."],
];

export default function Security() {
  return (
    <>
      <section className="pagehead">
        <div className="wrap">
          <p className="eyebrow">Security & privacy</p>
          <h1>What protects your household&apos;s data, and where it stops.</h1>
          <p className="lede">Plain statements about what FinMate does today, including the parts that aren&apos;t finished.</p>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <p className="eyebrow">What we do</p>
          <h2 className="h2">Six protections that exist in the product today.</h2>
          <ul className="claims">
            {PROTECTIONS.map(([t, d]) => <li key={t}><h3>{t}</h3><p>{d}</p></li>)}
          </ul>
        </div>
      </section>

      <section className="band alt">
        <div className="wrap two">
          <div>
            <p className="eyebrow">What the AI sees</p>
            <h2 className="h2">Anything you send to the assistant goes to Google&apos;s Gemini.</h2>
            <p>
              Receipt photos, voice notes and chat messages are processed by the Gemini API to read and answer them. Agents also
              receive the tool results they ask for, such as your budget percentages or recent expenses, so they can answer
              accurately. Don&apos;t upload a document you wouldn&apos;t want a model provider to process.
            </p>
          </div>
          <div>
            <p className="eyebrow">What we never do</p>
            <h2 className="h2">No bank access. No payments.</h2>
            <p>
              FinMate doesn&apos;t ask for your bank, card or UPI credentials, can&apos;t see your account balances, and can&apos;t move
              money. It only knows what you record.
            </p>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <p className="eyebrow">Honest limits</p>
          <h2 className="h2">Not built yet.</h2>
          <ul className="ticks cross">
            <li><b>Email verification.</b> Accounts aren&apos;t confirmed by email, so use an address you control.</li>
            <li><b>Password reset by email.</b> If you forget your password, a family admin can&apos;t reset it for you yet. Keep it somewhere safe.</li>
            <li><b>Two-factor authentication.</b> Sign-in is a password, or Google.</li>
            <li><b>Production hardening.</b> This build runs in a development setup. Don&apos;t treat it as a place for data you can&apos;t afford to lose.</li>
          </ul>
        </div>
      </section>

      <section className="closing">
        <div className="wrap">
          <div>
          <h2>Questions about how something works?</h2>
          <p>The architecture is explained in full, agent by agent.</p></div>
          <div className="cta-row"><Link href="/how-it-works" className="btn primary lg">How it works</Link></div>
        </div>
      </section>
    </>
  );
}

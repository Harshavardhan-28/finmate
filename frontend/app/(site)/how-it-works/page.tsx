import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How it works",
  description: "One orchestrator and four specialist agents share a single memory. Here is what happens when you upload a receipt.",
};

const STEPS = [
  ["You upload a receipt.", "The Orchestrator reads the request and decides which specialist should handle it."],
  ["The Receipt Agent reads it.", "A Gemini vision call reads the image and pulls out amount, date, merchant and category, then it proposes an expense."],
  ["You confirm.", "A card shows the fields. You fix anything wrong and press Confirm. Nothing is written until you do."],
  ["The expense is saved to shared memory.", "The same record is now visible to every agent that is allowed to see it."],
  ["The Budget Agent checks your limits.", "It recomputes the month and raises an alert if a line was just crossed, like Transport going from 94% to 112%."],
  ["The Insights Agent looks for a pattern.", "It spots repeats, such as 18 cab rides on one route, and saves a specific suggestion."],
  ["The Family Agent updates the household.", "The admin sees the alert in the household view. A member asking the same question is refused."],
];

const AGENTS = [
  ["Orchestrator", "Goal", "Understand the request, plan the steps, combine the answers.", "The four specialists"],
  ["Receipt Agent", "Goal", "Turn an image, voice note or form into a clean expense.", "Read receipt, transcribe voice, propose expense, save expense"],
  ["Budget Agent", "Goal", "Compare spending with limits and raise alerts.", "Budget status, set budget, alerts"],
  ["Family Agent", "Goal", "Give admins the household view and enforce roles.", "Role lookup, family view, add member"],
  ["Insights Agent", "Goal", "Find habits and suggest cheaper options.", "Expense history, trend analysis, alternatives, advice memory"],
];

export default function HowItWorks() {
  return (
    <>
      <section className="pagehead">
        <div className="wrap">
          <p className="eyebrow">How it works</p>
          <h1>One conversation in front. Five agents behind it.</h1>
          <p className="lede">
            You talk to a single assistant. Behind it, an Orchestrator hands work to four specialists that share one memory, so
            each of them can act on what the others have just learned.
          </p>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <figure className="arch" aria-label="Architecture: one orchestrator, four specialist agents, shared memory">
            <div className="arch-you">You</div>
            <div className="arch-line" />
            <div className="arch-orch">Orchestrator Agent</div>
            <div className="arch-line" />
            <div className="arch-agents">
              {["Receipt", "Budget", "Family", "Insights"].map((a) => <div key={a}>{a} Agent</div>)}
            </div>
            <div className="arch-line" />
            <div className="arch-mem">Shared memory: expenses, budgets, alerts, advice (PostgreSQL)</div>
            <figcaption>The supervisor pattern: specialists never talk to you directly; the Orchestrator does.</figcaption>
          </figure>
        </div>
      </section>

      <section className="band alt">
        <div className="wrap">
          <p className="eyebrow">A receipt, step by step</p>
          <h2 className="h2">What happens in the seconds after you upload.</h2>
          <ol className="steps">
            {STEPS.map(([t, d], i) => (
              <li key={t}><span className="num">{i + 1}</span><div><h3>{t}</h3><p>{d}</p></div></li>
            ))}
          </ol>
          <p className="note">In the app, upload receipts and voice notes from the Receipts page. The Assistant page keeps a live activity tape that lists every agent and tool call as it happens, including for receipts.</p>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <p className="eyebrow">Who does what</p>
          <h2 className="h2">Each agent can only use its own tools.</h2>
          <div className="table-wrap">
            <table className="spec">
              <thead><tr><th>Agent</th><th>Job</th><th>Tools it can call</th></tr></thead>
              <tbody>
                {AGENTS.map(([n, , job, tools]) => <tr key={n}><th scope="row">{n}</th><td>{job}</td><td>{tools}</td></tr>)}
              </tbody>
            </table>
          </div>
          <p>
            Tools are served over the Model Context Protocol, and each agent is shown only its own subset. The Budget Agent can&apos;t
            read receipts, and the Receipt Agent can&apos;t change a budget.
          </p>
        </div>
      </section>

      <section className="band alt">
        <div className="wrap two">
          <div>
            <p className="eyebrow">Why a human confirms</p>
            <h2 className="h2">Agents propose. You decide.</h2>
            <p>
              Language models misread blurry receipts. So extracted fields always land in a confirm card first, with uncertain
              fields highlighted. Budget changes suggested in chat are only applied after you approve them.
            </p>
          </div>
          <div>
            <p className="eyebrow">What it&apos;s built on</p>
            <h2 className="h2">Plain, inspectable parts.</h2>
            <p>
              Google&apos;s Agent Development Kit runs the agents on Gemini models. A FastAPI backend streams their activity to the
              browser, PostgreSQL stores the data, and the interface is Next.js.
            </p>
          </div>
        </div>
      </section>

      <section className="closing">
        <div className="wrap">
          <div>
          <h2>Watch the agents work on your own receipt.</h2></div>
          <div className="cta-row">
            <Link href="/signup" className="btn primary lg">Create an account</Link>
            <Link href="/security" className="btn lg">Read about security</Link>
          </div>
        </div>
      </section>
    </>
  );
}

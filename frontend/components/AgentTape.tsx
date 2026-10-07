"use client";
import { useEffect, useRef } from "react";
import { AGENTS, type TraceItem } from "@/lib/types";
import { agentKey, brief, unwrap } from "@/lib/format";

const POS: Record<string, [number, number]> = {
  orchestrator: [160, 30],
  receipt_agent: [38, 112],
  budget_agent: [113, 112],
  family_agent: [208, 112],
  insights_agent: [283, 112],
};
const LABEL: Record<string, string> = {
  orchestrator: "Orchestrator",
  receipt_agent: "Receipt",
  budget_agent: "Budget",
  family_agent: "Family",
  insights_agent: "Insights",
};

const colorVar = (agent: string) => ({ ["--c" as string]: `var(--a-${agentKey(agent)})` });

function SupervisorMap({ trace, busy }: { trace: TraceItem[]; busy: boolean }) {
  const turn = trace.length ? trace[trace.length - 1].turn : -1;
  const now = trace.filter((t) => t.turn === turn);
  const starts: Record<string, number> = {};
  const ends: Record<string, number> = {};
  for (const t of now) {
    if (t.kind === "agent_start") starts[t.agent] = (starts[t.agent] ?? 0) + 1;
    if (t.kind === "agent_end") ends[t.agent] = (ends[t.agent] ?? 0) + 1;
  }
  const state = (a: string) =>
    busy && (starts[a] ?? 0) > (ends[a] ?? 0) ? "active" : starts[a] ? "touched" : "";
  return (
    <div className="map">
      <svg viewBox="0 0 320 150" role="img" aria-label="Orchestrator delegating to four specialist agents">
        {AGENTS.slice(1).map((a) => (
          <line
            key={a}
            className={`edge ${starts[a] ? "on" : ""}`}
            x1={POS.orchestrator[0]}
            y1={POS.orchestrator[1] + 14}
            x2={POS[a][0]}
            y2={POS[a][1] - 14}
          />
        ))}
        {AGENTS.map((a) => (
          <g key={a} className={`node ${state(a)}`} style={colorVar(a)} transform={`translate(${POS[a][0]} ${POS[a][1]})`}>
            <circle r="15" stroke={`var(--a-${agentKey(a)})`} />
            {a === "orchestrator" ? (
              <text x="22" y="4" style={{ textAnchor: "start" }}>{LABEL[a]}</text>
            ) : (
              <text y="30">{LABEL[a]}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

function Line({ t, fresh }: { t: TraceItem; fresh: boolean }) {
  const delegated = t.tool?.endsWith("_agent");
  if (t.kind === "agent_end") return null;
  if (t.kind === "agent_start")
    return (
      <div className={`line ${fresh ? "new" : ""}`} style={colorVar(t.agent)}>
        <span className="dot" />
        <div className="what">
          <span className="who">{t.agent}</span> starts
        </div>
      </div>
    );
  if (t.kind === "tool_error")
    return (
      <div className="line err" style={colorVar(t.agent)}>
        <span className="dot" />
        <div className="what">
          <span className="who">{t.agent}</span> tool error in {t.tool}: {t.error}
        </div>
      </div>
    );
  const isCall = t.kind === "tool_call";
  const payload = isCall ? t.args : unwrap(t.result);
  const headline = isCall ? (
    delegated ? <>delegates to <b>{t.tool}</b></> : <>calls <b>{t.tool}</b></>
  ) : delegated ? (
    <>{t.tool} replied</>
  ) : (
    <>{t.tool} returned</>
  );
  return (
    <div className={`line ${isCall ? "" : "res"} ${fresh ? "new" : ""}`} style={colorVar(t.agent)}>
      <span className="dot" />
      <div className="what">
        <details>
          <summary>
            <span className="who">{t.agent}</span> {isCall ? "▸" : "◂"} {headline}
            <div style={{ color: "var(--ink-3)" }}>{brief(payload)}</div>
          </summary>
          <pre>{JSON.stringify(payload, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

export default function AgentTape({ trace, busy }: { trace: TraceItem[]; busy: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [trace.length]);
  return (
    <div className="tape-col">
      <h2>
        Agent activity <span className="chip">{busy ? "working" : "idle"}</span>
      </h2>
      <SupervisorMap trace={trace} busy={busy} />
      <div className="roll" aria-live="polite">
        {trace.length === 0 && (
          <div className="empty">Nothing yet. Send a message and every agent hop and MCP tool call prints here.</div>
        )}
        {trace.map((t, i) => {
          const head = i === 0 || t.turn !== trace[i - 1].turn;
          return (
            <div key={t.id}>
              {head && <div className="turn">request {t.turn}</div>}
              <Line t={t} fresh={i > trace.length - 6} />
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { GitFork, Lock, ShieldCheck } from "lucide-react";

import {
  FORK_AGENTS,
  ONCHAIN_BACKING,
  ORIGINAL,
  ORIGINAL_OUTPUT,
  type ForkAgent,
  type ForkResultLine,
} from "../lib/fork-demo-data";

type ForkState = "idle" | "running" | "done";

const TONE_CLASS: Record<NonNullable<ForkResultLine["tone"]>, string> = {
  positive: "text-mint",
  negative: "text-[#ff8a8a]",
  neutral: "text-lime",
};

function TeeBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-mint/40 bg-mint/10 px-2 py-0.5 text-[11px] font-medium text-mint">
      <ShieldCheck className="h-3 w-3" aria-hidden="true" />
      TEE Verified
    </span>
  );
}

function Connector() {
  return <div className="mx-auto h-6 w-px bg-line" aria-hidden="true" />;
}

function ForkCard({ agent, state }: { agent: ForkAgent; state: ForkState }) {
  return (
    <div
      className={`fm-card p-5 flex flex-col gap-3 transition-opacity duration-500 ${
        state === "idle" ? "opacity-40" : "opacity-100"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`rounded-xl bg-gradient-to-br ${agent.accent} p-2 text-xl leading-none`}>
          {agent.icon}
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold leading-tight">{agent.name}</h3>
          <p className="text-xs text-muted mt-1">{agent.summary}</p>
        </div>
      </div>

      <dl className="text-xs text-muted flex flex-col gap-1 border-t border-line pt-3">
        <div className="flex justify-between gap-3">
          <dt>Forked from</dt>
          <dd className="text-white text-right">{ORIGINAL.name}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Input</dt>
          <dd className="text-white text-right">Original News Output</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Creator</dt>
          <dd className="text-white text-right">{agent.creator}</dd>
        </div>
      </dl>

      <div className="flex items-center justify-between border-t border-line pt-3">
        <TeeBadge />
        {state === "running" && (
          <span className="text-xs text-muted animate-pulse">실행 중…</span>
        )}
      </div>

      {state === "done" && (
        <div className="border-t border-line pt-3 flex flex-col gap-2">
          {agent.lines.map((line) => (
            <div key={line.label} className="flex justify-between gap-3 text-xs">
              <span className="text-muted shrink-0">{line.label}</span>
              <span
                className={`text-right ${
                  line.tone === undefined ? "text-white" : TONE_CLASS[line.tone]
                }`}
              >
                {line.value}
              </span>
            </div>
          ))}
          <div className="mt-1 flex items-center justify-between rounded-xl bg-ink px-3 py-2">
            <span className="text-xs text-muted">{agent.verdict.label}</span>
            <span className={`text-sm font-semibold ${TONE_CLASS[agent.verdict.tone]}`}>
              {agent.verdict.value}
            </span>
          </div>
        </div>
      )}

      {state === "idle" && (
        <p className="border-t border-line pt-3 text-xs text-muted">
          원본 결과를 fork하면 이 agent가 실행됩니다.
        </p>
      )}
    </div>
  );
}

/**
 * Explainer for the fork/remix model: a buyer never sees the original
 * workflow, only its output, and can build a new workflow on top of that
 * output. Results here are written by hand — the page says so — because the
 * point is the shape of the flow and the on-chain primitives behind it, not
 * the analysis itself.
 */
export default function ForkDemo() {
  const [state, setState] = useState<ForkState>("idle");

  const runFork = () => {
    if (state !== "idle") return;
    setState("running");
    window.setTimeout(() => setState("done"), 1400);
  };

  return (
    <div className="min-h-screen bg-ink text-white">
      <Link to="/marketplace" className="inline-block text-muted hover:text-white text-sm mb-6">
        ← Marketplace로 돌아가기
      </Link>

      <header className="mb-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-bold">Fork &amp; Remix</h1>
          <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-[11px] text-muted">
            예시 데이터 · 실제 agent 실행 아님
          </span>
        </div>
        <p className="text-sm text-muted mt-3 leading-relaxed max-w-2xl">
          워크플로를 복제하는 것이 아니라, 워크플로가 <strong className="text-white">만들어낸
          결과물</strong>을 새로운 창작의 재료로 씁니다. 원본의 프롬프트와 내부 로직은
          끝까지 공개되지 않습니다.
        </p>
      </header>

      {/* ── 원본 ── */}
      <section className="mt-10">
        <div className="fm-card p-5 max-w-xl mx-auto">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">{ORIGINAL.name}</h2>
              <p className="text-xs text-muted mt-1">Creator · {ORIGINAL.creator}</p>
            </div>
            <TeeBadge />
          </div>
          <p className="text-xs text-muted mt-3">Input · {ORIGINAL.input}</p>
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-line bg-ink px-3 py-2">
            <Lock className="h-3.5 w-3.5 text-muted shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-[11px] text-muted leading-relaxed">
              {ORIGINAL.confidentialNote}
            </p>
          </div>
        </div>
      </section>

      <Connector />

      {/* ── 원본 결과 ── */}
      <section>
        <div className="fm-card p-5 max-w-xl mx-auto">
          <h2 className="font-semibold mb-1">News Output</h2>
          <p className="text-xs text-muted mb-4">
            구매자가 받는 것은 여기까지입니다. 이 결과는 공개할 수 있습니다.
          </p>
          <ul className="flex flex-col gap-2">
            {ORIGINAL_OUTPUT.map((item) => (
              <li key={item.title} className="rounded-xl bg-ink px-3 py-2">
                <p className="text-sm leading-snug">{item.title}</p>
                <p className="text-[11px] text-muted mt-1">
                  {item.source} · {item.publishedAt}
                </p>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={runFork}
            disabled={state !== "idle"}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue px-4 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            <GitFork className="h-4 w-4" aria-hidden="true" />
            {state === "idle" && "Fork this result"}
            {state === "running" && "포크한 agent들을 실행하는 중…"}
            {state === "done" && "3개 agent가 이 결과를 remix했습니다"}
          </button>
        </div>
      </section>

      <Connector />

      {/* ── 포크들 ── */}
      <section className="grid gap-4 md:grid-cols-3">
        {FORK_AGENTS.map((agent) => (
          <ForkCard key={agent.id} agent={agent} state={state} />
        ))}
      </section>

      {/* ── 온체인 근거 ── */}
      <section className="mt-12 fm-card p-6">
        <h2 className="text-lg font-semibold">이 화면을 뒷받침하는 온체인 기능</h2>
        <p className="text-xs text-muted mt-1 mb-4">
          위 결과값은 예시지만, 포크 구조 자체는 배포된 컨트랙트에 이미 구현되어 있습니다.
        </p>
        <div className="flex flex-col gap-3">
          {ONCHAIN_BACKING.map((row) => (
            <div
              key={row.ui}
              className="flex flex-col gap-1 border-b border-line pb-3 last:border-b-0 last:pb-0 md:flex-row md:items-baseline md:gap-4"
            >
              <span className="text-sm shrink-0 md:w-36">{row.ui}</span>
              <code className="text-[11px] text-mint break-all md:w-72">{row.move}</code>
              <span className="text-xs text-muted">{row.note}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

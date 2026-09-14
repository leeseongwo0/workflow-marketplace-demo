import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { Check, ExternalLink, Play, ShieldCheck } from "lucide-react";

import { WorkflowThumbnail } from "../components/WorkflowThumbnail";
import { LIVE_WORKFLOW_ID } from "../live/live-release";
import { useExecuteWorkflow } from "../live/use-execute-workflow";
import { useWorkflowStore } from "../stores/workflow-store";

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-6">{children}</div>
  );
}

export default function Execute() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const account = useCurrentAccount();
  const workflow = useWorkflowStore((s) => s.workflows.find((w) => w.id === id));
  const [query, setQuery] = useState("");
  const execute = useExecuteWorkflow();

  const backTo = (location.state as { from?: string } | null)?.from === "profile"
    ? { href: "/profile", label: "← 프로필로 돌아가기" }
    : { href: "/marketplace", label: "← Marketplace로 돌아가기" };

  if (workflow === undefined) {
    return (
      <div className="min-h-screen bg-ink text-white flex flex-col items-center justify-center gap-4">
        <p className="text-muted">Workflow not found.</p>
        <Link to={backTo.href} className="text-mint hover:underline">{backTo.label}</Link>
      </div>
    );
  }

  const runnable = workflow.id === LIVE_WORKFLOW_ID;
  const trimmed = query.trim();
  const queryLength = Array.from(trimmed).length;
  const queryValid = queryLength >= 2 && queryLength <= 200;

  return (
    <div className="min-h-screen bg-ink text-white">
      <Link to={backTo.href} className="inline-block text-muted hover:text-white text-sm mb-8">
        {backTo.label}
      </Link>

      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <WorkflowThumbnail workflow={workflow} className="h-16 w-16 rounded-xl" textClassName="text-2xl" />
          <div>
            <h1 className="text-2xl font-bold">{workflow.name}</h1>
            <p className="text-sm text-muted">{workflow.creator}</p>
          </div>
        </div>

        {!runnable ? (
          <Panel>
            <p className="text-sm text-muted">
              {workflow.onChainOnly === true
                ? "이 워크플로는 온체인에 등록되어 있지만 실행용 번들이 업로드되지 않아 실행할 수 없습니다. 번들 업로드는 이번 데모 범위 밖입니다."
                : "이 워크플로는 화면 구성용 샘플이라 실행할 수 없습니다. 실제로 실행되는 것은 Google News RSS Monitor 하나입니다."}
            </p>
          </Panel>
        ) : account === null ? (
          <Panel>
            <p className="text-sm text-muted">실행하려면 먼저 지갑을 연결해 주세요.</p>
          </Panel>
        ) : (
          <>
            <Panel>
              <label htmlFor="query" className="block text-sm font-medium mb-2">
                검색어
              </label>
              <p className="text-xs text-muted mb-3">
                최근 24시간 동안의 Google News 기사를 모아 정리합니다. 2~200자.
              </p>
              <div className="flex gap-3">
                <input
                  id="query"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && queryValid && !execute.busy) {
                      void execute.run(trimmed);
                    }
                  }}
                  disabled={execute.busy}
                  placeholder="예: Sui blockchain"
                  className="flex-1 rounded-xl border border-line bg-ink px-4 py-3 text-sm text-white placeholder:text-muted focus:border-mint outline-none disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => void execute.run(trimmed)}
                  disabled={!queryValid || execute.busy}
                  className="flex items-center gap-2 rounded-xl bg-blue px-5 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
                >
                  <Play className="h-4 w-4" fill="currentColor" aria-hidden="true" />
                  실행하기
                </button>
              </div>

              {execute.busy && (
                <p className="mt-4 flex items-center gap-3 text-sm text-muted">
                  <span className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-line border-t-white" />
                  {execute.stepLabel}
                </p>
              )}

              {execute.error !== undefined && (
                <p className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {execute.error}
                </p>
              )}
            </Panel>

            {execute.execution !== undefined && (
              <Panel>
                <h2 className="text-lg font-semibold mb-1">실행 결과</h2>
                <p className="text-xs text-muted mb-4">
                  &lsquo;{execute.execution.input.query}&rsquo; · {execute.execution.result.items.length}건
                </p>
                <ul className="flex flex-col gap-3">
                  {execute.execution.result.items.map((item) => (
                    <li key={item.url} className="rounded-xl border border-line bg-ink p-4">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-start gap-2 font-medium hover:text-mint"
                      >
                        {item.title}
                        <ExternalLink className="h-3.5 w-3.5 mt-1 flex-shrink-0" aria-hidden="true" />
                      </a>
                      <p className="mt-1 text-xs text-muted">
                        {item.source ?? "출처 미상"} · {new Date(item.publishedAt).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            {execute.receipt !== undefined && (
              <Panel>
                <h2 className="flex items-center gap-2 text-lg font-semibold mb-4">
                  <ShieldCheck className="h-5 w-5 text-mint" aria-hidden="true" />
                  실행 영수증
                </h2>
                <dl className="flex flex-col gap-2 text-xs">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">입력 해시</dt>
                    <dd className="font-mono break-all text-right">{execute.receipt.payload.inputHash}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">결과 해시</dt>
                    <dd className="font-mono break-all text-right">{execute.receipt.payload.outputHash}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">실행 시각</dt>
                    <dd>{new Date(execute.receipt.payload.executedAtMs).toLocaleString()}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">executor 키</dt>
                    <dd className="font-mono">{execute.receipt.executorKeyFingerprint}</dd>
                  </div>
                </dl>

                <p className="mt-4 text-xs text-muted">
                  executor의 서명이 Marketplace에 등록된 공개키와 일치하는 것을 확인했습니다.
                </p>

                {execute.recorded !== undefined ? (
                  <p className="mt-4 flex items-center gap-2 text-sm text-mint">
                    <Check className="h-4 w-4" aria-hidden="true" />
                    이 실행은 체인에 기록되어 있습니다.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => void execute.record()}
                    disabled={execute.recordStatus === "signing" || execute.recordStatus === "confirming"}
                    className="mt-4 w-full rounded-xl bg-blue px-4 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
                  >
                    {execute.recordStatus === "signing"
                      ? "지갑 서명 대기 중…"
                      : execute.recordStatus === "confirming"
                        ? "체인 확정 대기 중…"
                        : "체인에 기록하기"}
                  </button>
                )}
              </Panel>
            )}
          </>
        )}
      </div>
    </div>
  );
}

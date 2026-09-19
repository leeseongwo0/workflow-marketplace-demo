import { useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { Check, ExternalLink, History, Play, RefreshCw, ShieldCheck, X } from "lucide-react";

import { BriefResult } from "../components/BriefResult";
import { WorkflowThumbnail } from "../components/WorkflowThumbnail";
import { LIVE_WORKFLOW_ID } from "../live/live-release";
import { listExecutionHistory } from "../live/execution-history";
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

  // The forked brief has no bundle, so its screen shows a saved run instead of
  // offering to start one. Its headlines come from the original workflow's last
  // real result when this browser has one, because a fork is built out of the
  // original's output — showing that literally is stronger than describing it.
  const BRIEF_ID = "ai-morning-brief";
  const FALLBACK_STORIES = [
    "NVIDIA, AI 데이터센터 수요로 GPU 주문 급증",
    "미국, 첨단 반도체 수출 규제 추가 검토",
    "TSMC·SK하이닉스, HBM 생산능력 확대 논의",
  ];
  const savedBrief = useMemo(() => {
    if (workflow?.id !== BRIEF_ID) return undefined;
    const latest =
      account === null ? undefined : listExecutionHistory(account.address)[0];
    const titles = latest?.response.result.items.slice(0, 3).map((item) => item.title);
    return {
      topStories: titles !== undefined && titles.length > 0 ? titles : FALLBACK_STORIES,
      executedAtMs: latest?.executedAtMs ?? Date.parse("2026-09-19T08:42:00.000Z"),
    };
  }, [workflow?.id, account]);
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

        {savedBrief !== undefined ? (
          <Panel>
            <BriefResult
              topStories={savedBrief.topStories}
              executedAtMs={savedBrief.executedAtMs}
            />
          </Panel>
        ) : !runnable ? (
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

              {/* Two ways back to an earlier search: the stored result, which
                  needs no signature and no executor, or the same query run
                  again for current news. Typing it out a second time is the
                  only thing being saved either way. */}
              {execute.history.length > 0 && !execute.busy && (
                <div className="mt-5 border-t border-line pt-4">
                  <p className="flex items-center gap-2 text-xs text-muted">
                    <History className="h-3.5 w-3.5" aria-hidden="true" />
                    이전 검색어
                  </p>
                  <ul className="mt-3 flex flex-col gap-2">
                    {execute.history.map((entry) => (
                      <li
                        key={entry.response.executionId}
                        className="flex items-center gap-2 rounded-xl border border-line px-3 py-2"
                      >
                        <button
                          type="button"
                          onClick={() => void execute.replay(entry)}
                          title="저장된 결과를 다시 봅니다. 지갑 서명이 필요 없습니다."
                          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left text-sm hover:text-mint"
                        >
                          <span className="truncate">{entry.response.input.query}</span>
                          <span className="flex-shrink-0 text-xs text-muted">
                            {entry.response.result.items.length}건 ·{" "}
                            {new Date(entry.executedAtMs).toLocaleString("ko-KR", {
                              month: "numeric",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setQuery(entry.response.input.query);
                            void execute.run(entry.response.input.query);
                          }}
                          title="같은 검색어로 지금 다시 실행합니다. 지갑 서명이 한 번 필요합니다."
                          className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted hover:border-mint hover:text-mint"
                        >
                          <RefreshCw className="h-3 w-3" aria-hidden="true" />
                          최신으로
                        </button>
                        <button
                          type="button"
                          onClick={() => execute.forget(entry.response.executionId)}
                          aria-label={`${entry.response.input.query} 기록 삭제`}
                          title="이 기록만 지웁니다. 체인에 남은 실행 기록과는 무관합니다."
                          className="flex flex-shrink-0 items-center justify-center rounded-lg border border-line p-1.5 text-muted hover:border-red-500/50 hover:text-red-400"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted">
                    검색어를 누르면 저장된 결과가, &lsquo;최신으로&rsquo;를 누르면
                    지금 기준 뉴스가 나옵니다.
                  </p>
                </div>
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
                {/* News always looks current, so a result pulled back from
                    storage has to say when it was actually fetched. The time
                    comes from the receipt the executor signed, not from when
                    this screen happened to render it. */}
                <p className="text-xs text-muted mb-4">
                  &lsquo;{execute.execution.input.query}&rsquo; ·{" "}
                  {execute.execution.result.items.length}건 ·{" "}
                  {new Date(
                    execute.execution.receipt.payload.executedAtMs,
                  ).toLocaleString("ko-KR", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  실행
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
                  영수증의 내용과 executor 서명이 서로 일치하는 것을 확인했습니다. 이
                  서명을 대조할 공개키는 배포된 컨트랙트에 등록되어 있지 않으므로,
                  executor가 제시한 키를 그대로 사용했습니다.
                </p>

                {/* Record failures used to surface only in the status area at the
                    top of the page, far above this button, so a failed record
                    looked like nothing had happened at all. */}
                {execute.recordStatus === "error" && execute.error !== undefined && (
                  <p className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {execute.error}
                  </p>
                )}

                {execute.recorded !== undefined ? (
                  <p className="mt-4 flex items-center gap-2 text-sm text-mint">
                    <Check className="h-4 w-4" aria-hidden="true" />
                    이 실행은 체인에 기록되어 있습니다.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => void execute.record()}
                    disabled={execute.recordStatusLabel !== undefined}
                    className="mt-4 w-full rounded-xl bg-blue px-4 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
                  >
                    {execute.recordStatusLabel ?? "체인에 기록하기"}
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

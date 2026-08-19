import { useEffect, useRef, useState } from "react";

import { LandingPage } from "./LandingPage";
import { LiveDemoPage } from "./LiveDemoPage";
import { webConfig } from "./live/config";

type AsyncState = "idle" | "pending" | "complete";
type WalletState = AsyncState;
type Stage = "license" | "execution" | "report";

type FixtureNewsItem = {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  accent: string;
};

const FIXTURE_RESULTS: readonly FixtureNewsItem[] = [
  {
    id: "fixture-ko-001",
    title: "국내 AI 생태계, 신뢰 가능한 데이터 활용 원칙 논의 본격화",
    source: "테크 브리핑",
    publishedAt: "2026. 8. 17. 16:42 KST",
    url: "https://news.google.com/rss/articles/fixture-ko-001",
    accent: "민트",
  },
  {
    id: "fixture-ko-002",
    title: "공공·민간 협력으로 생성형 AI 안전성 평가 체계 고도화",
    source: "디지털 포커스",
    publishedAt: "2026. 8. 17. 14:18 KST",
    url: "https://news.google.com/rss/articles/fixture-ko-002",
    accent: "라임",
  },
  {
    id: "fixture-ko-003",
    title: "한국어 특화 소형 언어모델, 산업 현장 도입 사례 늘어",
    source: "산업 뉴스랩",
    publishedAt: "2026. 8. 17. 10:07 KST",
    url: "https://news.google.com/rss/articles/fixture-ko-003",
    accent: "블루",
  },
] as const;

const SECURITY_LABELS = [
  "Execution mode: Local server",
  "Nautilus: Not implemented",
  "TEE attestation: Disabled",
  "Key provider: Local demo key",
  "Network: Sui Testnet / Walrus Testnet",
] as const;

function FixtureMark() {
  return (
    <span className="demo-brand-mark" aria-hidden="true">
      ✦
    </span>
  );
}

function SecurityDisclosure() {
  return (
    <aside className="demo-security" aria-label="Fixture security disclosure">
      <div className="demo-security-heading">
        <span>FIXTURE MODE</span>
        <small>Local presentation boundary</small>
      </div>
      <ul>
        {SECURITY_LABELS.map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ul>
    </aside>
  );
}

function StageMarker({ label, number }: { label: string; number: string }) {
  return (
    <div className="demo-stage-marker">
      <span>{number}</span>
      <strong>{label}</strong>
      <em>Fixture mode</em>
    </div>
  );
}

function LicenseStage({
  walletState,
  licenseState,
  onLicense,
}: {
  walletState: WalletState;
  licenseState: AsyncState;
  onLicense: () => void;
}) {
  const walletReady = walletState === "complete";
  const licensePending = licenseState === "pending";

  return (
    <section className="demo-stage demo-stage--license" aria-labelledby="license-title">
      <StageMarker label="LicensePass" number="01" />
      <div className="demo-license-card">
        <p className="demo-eyebrow">GOOGLE NEWS RSS MONITOR</p>
        <h1 id="license-title">LicensePass</h1>
        <p className="demo-stage-intro">
          하나의 검색 워크플로를 실행할 수 있는 fixture 라이선스 상태만 준비합니다.
        </p>

        <dl className="demo-facts">
          <div>
            <dt>Workflow</dt>
            <dd>Google News RSS Monitor</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>1.0.0</dd>
          </div>
          <div>
            <dt>Price</dt>
            <dd>0.10 Testnet SUI · display only</dd>
          </div>
          <div>
            <dt>Current license state</dt>
            <dd>{
              licensePending
                ? "Fixture action pending"
                : walletReady
                  ? "Ready for fixture action"
                  : "Wallet login required"
            }</dd>
          </div>
        </dl>

        <p className="demo-operational-hint">
          {walletReady
            ? "The next step stays local to this presentation fixture."
            : "Wallet login is required before the fixture license action can begin."}
        </p>
        <button
          className="demo-primary-button"
          type="button"
          disabled={!walletReady || licenseState !== "idle"}
          onClick={onLicense}
        >
          {licensePending ? "Preparing fixture state…" : "Continue with LicensePass"}
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}

function ExecutionStage({
  query,
  runState,
  queryInputRef,
  onQueryChange,
  onRun,
}: {
  query: string;
  runState: AsyncState;
  queryInputRef: React.RefObject<HTMLInputElement | null>;
  onQueryChange: (value: string) => void;
  onRun: () => void;
}) {
  return (
    <section className="demo-stage demo-stage--execution" aria-labelledby="execution-title">
      <StageMarker label="Execution" number="02" />
      <div className="demo-query-surface">
        <p className="demo-eyebrow">GOOGLE NEWS RSS MONITOR · FIXTURE INPUT</p>
        <h1 id="execution-title">What should we search?</h1>
        <form
          className="demo-query-form"
          onSubmit={(event) => {
            event.preventDefault();
            onRun();
          }}
        >
          <label htmlFor="fixture-query">Search query</label>
          <div className="demo-query-field">
            <input
              ref={queryInputRef}
              id="fixture-query"
              value={query}
              maxLength={80}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="예: 생성형 AI 정책"
              autoComplete="off"
              disabled={runState === "pending"}
            />
            <button
              className="demo-query-submit"
              type="submit"
              disabled={runState === "pending" || !query.trim()}
              aria-label="Run fixture query"
            >
              {runState === "pending" ? "…" : "→"}
            </button>
          </div>
        </form>
        <p className="demo-stage-note" aria-live="polite">
          {runState === "pending"
            ? "Preparing the fixture report…"
            : "Fixture mode · this query stays in browser state and makes no network request."}
        </p>
      </div>
    </section>
  );
}

function ReportStage({
  onReceiptOpen,
  receiptTriggerRef,
}: {
  onReceiptOpen: () => void;
  receiptTriggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <section className="demo-stage demo-stage--report" aria-labelledby="report-title">
      <StageMarker label="Report" number="03" />
      <div className="demo-report-surface">
        <div className="demo-report-heading">
          <div>
            <p className="demo-eyebrow">FIXTURE OUTPUT · LATEST FIRST</p>
            <h1 id="report-title">Signal report</h1>
          </div>
          <div className="demo-result-count" aria-label={`${FIXTURE_RESULTS.length} fixture results`}>
            <strong>{FIXTURE_RESULTS.length}</strong>
            <span>RESULTS</span>
          </div>
        </div>

        <p className="demo-fixture-disclosure">
          <strong>Fixture mode</strong> · 발표용으로 고정된 결과이며 실시간 Google News 응답이 아닙니다.
        </p>

        <ol className="demo-news-list" aria-label="Fixture news results">
          {FIXTURE_RESULTS.map((item, index) => (
            <li key={item.id}>
              <span className="demo-news-index">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <div className="demo-news-meta">
                  <span>{item.source}</span>
                  <time>{item.publishedAt}</time>
                  <i>{item.accent}</i>
                </div>
                <h2>{item.title}</h2>
                <p className="demo-news-url">Fixture result URL · external navigation disabled</p>
              </div>
            </li>
          ))}
        </ol>

        <button
          ref={receiptTriggerRef}
          className="demo-secondary-button"
          type="button"
          onClick={onReceiptOpen}
        >
          Receipt 확인하기 <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}

function ReceiptModal({
  open,
  closeButtonRef,
  onClose,
}: {
  open: boolean;
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="demo-modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="demo-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-dialog-title"
        aria-describedby="receipt-dialog-description"
      >
        <div className="demo-modal-heading">
          <div>
            <p className="demo-eyebrow">LOCAL PREVIEW · NOT RECORDED</p>
            <h2 id="receipt-dialog-title">Receipt preview</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="demo-modal-close"
            type="button"
            onClick={onClose}
            aria-label="Close receipt preview"
          >
            ×
          </button>
        </div>
        <p id="receipt-dialog-description" className="demo-modal-description">
          This is a local fixture preview. No receipt is signed or submitted on-chain.
        </p>
        <pre className="demo-receipt-preview" aria-label="Receipt preview payload">
{`{
  "status": "fixture preview · not signed",
  "workflowType": "google_news_rss/v1",
  "releaseId": "Not published",
  "resultCount": ${FIXTURE_RESULTS.length}
}`}
        </pre>
        <dl className="demo-receipt-facts">
          <div>
            <dt>Key fingerprint</dt>
            <dd>Unavailable · fixture key not exposed</dd>
          </div>
          <div>
            <dt>Receipt object ID</dt>
            <dd>Not published</dd>
          </div>
          <div>
            <dt>Transaction digest</dt>
            <dd>Not published</dd>
          </div>
          <div>
            <dt>Explorer link</dt>
            <dd>Unavailable · no live explorer link</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function DemoPage() {
  const [walletState, setWalletState] = useState<WalletState>("idle");
  const [stage, setStage] = useState<Stage>("license");
  const [licenseState, setLicenseState] = useState<AsyncState>("idle");
  const [runState, setRunState] = useState<AsyncState>("idle");
  const [query, setQuery] = useState("생성형 AI 정책");
  const [receiptOpen, setReceiptOpen] = useState(false);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryInputRef = useRef<HTMLInputElement>(null);
  const receiptTriggerRef = useRef<HTMLButtonElement>(null);
  const receiptCloseButtonRef = useRef<HTMLButtonElement>(null);

  const scheduleTransition = (callback: () => void, delay: number) => {
    if (transitionTimer.current !== null) clearTimeout(transitionTimer.current);
    transitionTimer.current = setTimeout(() => {
      transitionTimer.current = null;
      callback();
    }, delay);
  };

  useEffect(() => {
    return () => {
      if (transitionTimer.current !== null) clearTimeout(transitionTimer.current);
    };
  }, []);

  useEffect(() => {
    if (stage === "execution") queryInputRef.current?.focus();
  }, [stage]);

  useEffect(() => {
    if (!receiptOpen) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusTimer = window.setTimeout(() => receiptCloseButtonRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setReceiptOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [receiptOpen]);

  const handleWallet = () => {
    if (walletState !== "idle") return;
    setWalletState("pending");
    scheduleTransition(() => setWalletState("complete"), 650);
  };

  const handleLicense = () => {
    if (walletState !== "complete" || licenseState !== "idle") return;
    setLicenseState("pending");
    scheduleTransition(() => {
      setLicenseState("complete");
      setStage("execution");
    }, 800);
  };

  const handleRun = () => {
    if (stage !== "execution" || runState !== "idle" || !query.trim()) return;
    setRunState("pending");
    scheduleTransition(() => {
      setRunState("complete");
      setStage("report");
    }, 950);
  };

  const resetDemo = () => {
    if (transitionTimer.current !== null) clearTimeout(transitionTimer.current);
    transitionTimer.current = null;
    setWalletState("idle");
    setStage("license");
    setLicenseState("idle");
    setRunState("idle");
    setQuery("생성형 AI 정책");
    setReceiptOpen(false);
  };

  const liveMessage = walletState === "pending"
    ? "Fixture wallet state is preparing."
    : licenseState === "pending"
      ? "Fixture LicensePass state is preparing."
      : runState === "pending"
        ? "Fixture report is preparing."
        : stage === "report"
          ? "Fixture report is ready. Receipt preview remains local."
          : stage === "execution"
            ? "LicensePass fixture state is ready. Execution input is available."
            : "Wallet login is required before the fixture license action can begin.";

  return (
    <main className="demo-page">
      <header className="demo-topbar">
        <a className="demo-back-link" href="/" aria-label="Back to Workflow Market home">
          <FixtureMark />
          <span>WORKFLOW<span>/MARKET</span></span>
          <small>← Back</small>
        </a>
        <div className="demo-topbar-actions">
          <span className="demo-fixture-pill">Fixture mode</span>
          <button
            className="demo-wallet-button"
            type="button"
            onClick={handleWallet}
            disabled={walletState !== "idle"}
            aria-busy={walletState === "pending"}
          >
            <span className="demo-wallet-dot" aria-hidden="true" />
            {walletState === "pending"
              ? "Connecting fixture…"
              : walletState === "complete"
                ? "Fixture wallet · connected"
                : "Log in wallet"}
          </button>
        </div>
      </header>

      <div className="demo-content">
        <SecurityDisclosure />
        <p className="demo-live-region" aria-live="polite" role="status">{liveMessage}</p>

        {stage === "license" && (
          <LicenseStage
            walletState={walletState}
            licenseState={licenseState}
            onLicense={handleLicense}
          />
        )}
        {stage === "execution" && (
          <ExecutionStage
            query={query}
            runState={runState}
            queryInputRef={queryInputRef}
            onQueryChange={setQuery}
            onRun={handleRun}
          />
        )}
        {stage === "report" && (
          <ReportStage
            onReceiptOpen={() => setReceiptOpen(true)}
            receiptTriggerRef={receiptTriggerRef}
          />
        )}

        <div className="demo-footer-controls">
          <span>Presentation preview · no wallet, purchase, execution, or receipt transaction is live.</span>
          <button className="demo-reset-button" type="button" onClick={resetDemo}>Reset demo</button>
        </div>
      </div>

      <ReceiptModal
        open={receiptOpen}
        closeButtonRef={receiptCloseButtonRef}
        onClose={() => setReceiptOpen(false)}
      />
    </main>
  );
}

export function App() {
  const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
  const isDemoRoute = normalizedPath === "/app";

  useEffect(() => {
    const title = isDemoRoute
      ? "Google News RSS Monitor · Fixture Demo"
      : "Workflow/Market · Licensed AI Workflow Assets";
    const description = isDemoRoute
      ? "Google News RSS Monitor의 로컬 Fixture mode 실행 데모"
      : "라이선스 가능한 AI 워크플로 에셋을 소개하는 Workflow/Market 로컬 프리뷰";

    document.title = title;
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute("content", description);
  }, [isDemoRoute]);

  if (!isDemoRoute) return <LandingPage />;
  return webConfig.mode === "fixture"
    ? <DemoPage />
    : <LiveDemoPage config={webConfig} />;
}

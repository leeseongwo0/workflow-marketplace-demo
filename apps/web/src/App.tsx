import { useEffect, useMemo, useRef, useState } from "react";

type DemoStep = "wallet" | "license" | "run" | "receipt";
type AsyncState = "idle" | "pending" | "complete";

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

const FLOW_STEPS: readonly { key: DemoStep; label: string; eyebrow: string }[] = [
  { key: "wallet", label: "Wallet", eyebrow: "01" },
  { key: "license", label: "License", eyebrow: "02" },
  { key: "run", label: "Run", eyebrow: "03" },
  { key: "receipt", label: "Receipt", eyebrow: "04" },
] as const;

const SECURITY_LABELS = [
  "Execution mode: Local server",
  "Nautilus: Not implemented",
  "TEE attestation: Disabled",
  "Key provider: Local demo key",
  "Network: Sui Testnet / Walrus Testnet",
] as const;

function ArrowIcon() {
  return <span aria-hidden="true" className="arrow-icon">→</span>;
}

function SparkIcon() {
  return <span aria-hidden="true" className="spark-icon">✦</span>;
}

function StatusDot({ state }: { state: "ready" | "waiting" | "offline" }) {
  return <span aria-hidden="true" className={`status-dot status-dot--${state}`} />;
}

function FieldRow({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="field-row">
      <dt>{label}</dt>
      <dd className={muted ? "field-muted" : undefined}>{value}</dd>
    </div>
  );
}

export function App() {
  const [walletState, setWalletState] = useState<AsyncState>("idle");
  const [licenseState, setLicenseState] = useState<AsyncState>("idle");
  const [runState, setRunState] = useState<AsyncState>("idle");
  const [receiptState, setReceiptState] = useState<AsyncState>("idle");
  const [query, setQuery] = useState("생성형 AI 정책");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const walletReady = walletState === "complete";
  const licenseReady = licenseState === "complete";
  const runReady = runState === "complete";
  const receiptReady = receiptState === "complete";

  const activeStep: DemoStep = useMemo(() => {
    if (!walletReady) return "wallet";
    if (!licenseReady) return "license";
    if (!runReady) return "run";
    return "receipt";
  }, [licenseReady, runReady, walletReady]);

  const addTimer = (callback: () => void, milliseconds: number) => {
    timers.current.push(setTimeout(callback, milliseconds));
  };

  useEffect(() => {
    return () => {
      timers.current.forEach(clearTimeout);
    };
  }, []);

  const simulateWallet = () => {
    setWalletState("pending");
    addTimer(() => setWalletState("complete"), 700);
  };

  const simulateLicense = () => {
    setLicenseState("pending");
    addTimer(() => setLicenseState("complete"), 850);
  };

  const simulateRun = () => {
    if (!query.trim()) return;
    setRunState("pending");
    setReceiptState("idle");
    addTimer(() => setRunState("complete"), 1150);
  };

  const simulateReceipt = () => {
    setReceiptState("pending");
    addTimer(() => setReceiptState("complete"), 780);
  };

  const resetDemo = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setWalletState("idle");
    setLicenseState("idle");
    setRunState("idle");
    setReceiptState("idle");
    setQuery("생성형 AI 정책");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#overview" aria-label="AI Workflow Marketplace 홈">
          <span className="brand-mark"><SparkIcon /></span>
          <span>WORKFLOW<span className="brand-accent">/MARKET</span></span>
        </a>
        <div className="topbar-actions">
          <span className="fixture-badge"><StatusDot state="ready" />Fixture mode</span>
          <button className="text-button" type="button" onClick={resetDemo}>데모 초기화</button>
        </div>
      </header>

      <section className="hero" id="overview">
        <div className="hero-copy">
          <p className="kicker"><span>CURATED WORKFLOW · 01</span><span>LOCAL PRESENTATION BUILD</span></p>
          <h1>Discover the signal.<br /><em>Keep the workflow.</em></h1>
          <p className="hero-description">
            뉴스 검색을 반복 가능한 디지털 에셋으로. 한국어 Google News RSS를 정규화하는
            단일 워크플로의 구매부터 실행, 영수증까지 한 화면에서 미리 봅니다.
          </p>
          <div className="hero-meta" aria-label="워크플로 핵심 정보">
            <div><span>TYPE</span><strong>google_news_rss/v1</strong></div>
            <div><span>RELEASE</span><strong>1.0.0</strong></div>
            <div><span>RESULT WINDOW</span><strong>Latest 24 hours</strong></div>
          </div>
        </div>

        <aside className="hero-note" aria-label="Fixture mode 안내">
          <span className="note-index">DEMO / 001</span>
          <div className="note-orbit" aria-hidden="true"><span /></div>
          <h2>Fixture mode</h2>
          <p>화면과 진행 흐름을 위한 로컬 프리뷰입니다. 실시간 Google News 조회가 아닙니다.</p>
          <div className="note-state"><StatusDot state="offline" /><span>NO LIVE SERVICES CONNECTED</span></div>
        </aside>
      </section>

      <section className="disclosure" aria-labelledby="security-title">
        <div className="disclosure-heading">
          <p>TRUST BOUNDARY</p>
          <h2 id="security-title">Demo security disclosure</h2>
          <span>로컬 서버는 평문을 확인할 수 있는 데모 경계입니다.</span>
        </div>
        <ul className="security-grid">
          {SECURITY_LABELS.map((label, index) => (
            <li key={label}>
              <span className="security-number">0{index + 1}</span>
              <StatusDot state={index === 0 || index === 4 ? "ready" : "offline"} />
              <strong>{label}</strong>
            </li>
          ))}
        </ul>
      </section>

      <section className="workspace" aria-label="워크플로 데모">
        <aside className="asset-panel">
          <div className="asset-heading">
            <span className="section-label">FEATURED ASSET</span>
            <span className="edition">01 / 01</span>
          </div>
          <div className="asset-visual" aria-hidden="true">
            <div className="signal signal--one" />
            <div className="signal signal--two" />
            <div className="signal signal--three" />
            <span className="asset-monogram">GN</span>
            <span className="asset-version">V1.0</span>
          </div>
          <div className="asset-title-row">
            <div>
              <p>MONITOR · KOREAN / SOUTH KOREA</p>
              <h2>Google News<br />RSS Monitor</h2>
            </div>
            <span className="verified">✓</span>
          </div>
          <p className="asset-summary">검색어 하나로 최신 24시간 한국어 뉴스를 최대 10건까지 정규화합니다.</p>
          <dl className="asset-data">
            <FieldRow label="Creator" value="AIWF Demo Studio" />
            <FieldRow label="Price" value="0.10 Testnet SUI · display only" />
            <FieldRow label="Workflow type" value="google_news_rss/v1" />
            <FieldRow label="Root ID" value="Not published" muted />
            <FieldRow label="Release ID" value="Not published" muted />
            <FieldRow label="Walrus Blob ID" value="Not published" muted />
            <FieldRow label="Public manifest hash" value="Not published" muted />
          </dl>
        </aside>

        <div className="flow-panel">
          <div className="flow-header">
            <div>
              <span className="section-label">SIMULATED BUYER JOURNEY</span>
              <h2>Run the asset</h2>
            </div>
            <span className="flow-mode">Fixture mode · no network calls</span>
          </div>

          <nav className="stepper" aria-label="데모 진행 단계">
            {FLOW_STEPS.map((step) => {
              const stepComplete =
                (step.key === "wallet" && walletReady) ||
                (step.key === "license" && licenseReady) ||
                (step.key === "run" && runReady) ||
                (step.key === "receipt" && receiptReady);
              return (
                <div className={`step ${activeStep === step.key ? "step--active" : ""} ${stepComplete ? "step--complete" : ""}`} key={step.key}>
                  <span>{stepComplete ? "✓" : step.eyebrow}</span>
                  <strong>{step.label}</strong>
                </div>
              );
            })}
          </nav>

          <div className="action-grid">
            <article className={`action-card ${activeStep === "wallet" ? "action-card--active" : ""}`}>
              <div className="card-index"><span>01</span><p>WALLET</p></div>
              <div className="card-body">
                <div className="card-title-line"><h3>Presentation wallet</h3><StatusDot state={walletReady ? "ready" : "waiting"} /></div>
                <p>실제 지갑 SDK 없이 연결 상태만 시뮬레이션합니다. 서명 요청이나 체인 읽기는 발생하지 않습니다.</p>
                <dl className="mini-data">
                  <FieldRow label="Network guard" value="Sui Testnet · demo label" />
                  <FieldRow label="Current address" value={walletReady ? "Demo session · no address" : "Not connected"} muted />
                </dl>
                <button className="primary-button" type="button" disabled={walletState !== "idle"} onClick={simulateWallet}>
                  {walletState === "pending" ? "연결 상태 준비 중…" : walletReady ? "데모 지갑 준비됨" : "지갑 연결 시뮬레이션"}
                  {walletState === "idle" && <ArrowIcon />}
                </button>
              </div>
            </article>

            <article className={`action-card ${activeStep === "license" ? "action-card--active" : ""}`}>
              <div className="card-index"><span>02</span><p>LICENSE</p></div>
              <div className="card-body">
                <div className="card-title-line"><h3>LicensePass</h3><StatusDot state={licenseReady ? "ready" : "waiting"} /></div>
                <p>릴리스 1.0.0의 무제한 실행 라이선스 상태를 로컬 UI에서만 전환합니다.</p>
                <dl className="mini-data">
                  <FieldRow label="Detected pass" value={licenseReady ? "Fixture-ready · not on-chain" : "None"} muted={!licenseReady} />
                  <FieldRow label="License object ID" value="Not published" muted />
                  <FieldRow label="Purchase transaction" value="Not published" muted />
                </dl>
                <button className="primary-button" type="button" disabled={!walletReady || licenseState !== "idle"} onClick={simulateLicense}>
                  {licenseState === "pending" ? "라이선스 단계 처리 중…" : licenseReady ? "라이선스 데모 준비됨" : "라이선스 구매 시뮬레이션"}
                  {walletReady && licenseState === "idle" && <ArrowIcon />}
                </button>
              </div>
            </article>
          </div>

          <article className={`execution-card ${activeStep === "run" ? "execution-card--active" : ""}`}>
            <div className="execution-copy">
              <span className="section-label">03 / EXECUTION</span>
              <h3>What should we monitor?</h3>
              <p>입력값은 브라우저 상태에만 머물며, 아래 결과는 미리 저장한 한국어 뉴스 fixture입니다.</p>
            </div>
            <div className="query-control">
              <label htmlFor="query">Search query</label>
              <div className="query-input-wrap">
                <input
                  id="query"
                  value={query}
                  maxLength={80}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    if (runState === "complete") {
                      setRunState("idle");
                      setReceiptState("idle");
                    }
                  }}
                  placeholder="예: 생성형 AI 정책"
                  disabled={!licenseReady || runState === "pending"}
                />
                <button type="button" onClick={simulateRun} disabled={!licenseReady || !query.trim() || runState === "pending"} aria-label="워크플로 실행 시뮬레이션">
                  {runState === "pending" ? <span className="spinner" aria-hidden="true" /> : <ArrowIcon />}
                </button>
              </div>
              <div className="execution-status" aria-live="polite">
                <span><StatusDot state={runState === "pending" ? "waiting" : runReady ? "ready" : "offline"} />Challenge: {runState === "pending" ? "simulating" : runReady ? "fixture accepted" : "not requested"}</span>
                <span>Signing: {runReady ? "skipped in Fixture mode" : "not requested"}</span>
              </div>
              <div className="trace-strip">
                <span>Execution trace</span>
                <strong>{runState === "pending" ? "Fixture loader → normalizing…" : runReady ? "Fixture loader → normalize → latest-first" : "Awaiting simulated run"}</strong>
                <span>Typed error: None</span>
              </div>
            </div>
          </article>

          <section className={`results-section ${runReady ? "results-section--visible" : ""}`} aria-labelledby="results-title" aria-live="polite">
            <div className="results-heading">
              <div>
                <span className="section-label">FIXTURE OUTPUT · LATEST FIRST</span>
                <h2 id="results-title">Signal report</h2>
              </div>
              <div className="result-count"><strong>{runReady ? FIXTURE_RESULTS.length : "—"}</strong><span>RESULTS</span></div>
            </div>

            {!runReady ? (
              <div className="empty-results">
                <span>03</span>
                <p>{licenseReady ? "검색어를 입력하고 실행하면 fixture 결과가 여기에 표시됩니다." : "Wallet → License 단계를 완료하면 실행할 수 있습니다."}</p>
              </div>
            ) : (
              <>
                <div className="fixture-callout">
                  <strong>Fixture mode</strong>
                  <span>실시간 Google News 응답이 아닌 발표용 고정 데이터입니다.</span>
                </div>
                <ol className="news-list">
                  {FIXTURE_RESULTS.map((item, index) => (
                    <li key={item.id}>
                      <span className="news-index">{String(index + 1).padStart(2, "0")}</span>
                      <div className="news-main">
                        <div className="news-meta"><span>{item.source}</span><time>{item.publishedAt}</time><i>{item.accent}</i></div>
                        <h3>{item.title}</h3>
                        <p title={item.url}>{item.url}</p>
                        <span className="url-note">Fixture Google News URL · external navigation disabled</span>
                      </div>
                    </li>
                  ))}
                </ol>
                <dl className="hash-row">
                  <FieldRow label="Input hash" value="Not generated · Fixture mode" muted />
                  <FieldRow label="Output hash" value="Not generated · Fixture mode" muted />
                </dl>
              </>
            )}
          </section>

          <section className={`receipt-section ${runReady ? "receipt-section--ready" : ""}`} aria-labelledby="receipt-title">
            <div className="receipt-heading">
              <span className="receipt-number">04</span>
              <div>
                <span className="section-label">LOCAL PREVIEW</span>
                <h2 id="receipt-title">Execution receipt</h2>
              </div>
            </div>
            <div className="receipt-grid">
              <div className="payload-preview">
                <span>SIGNED PAYLOAD PREVIEW · NOT SIGNED</span>
                <pre>{`{
  "workflowType": "google_news_rss/v1",
  "release": "1.0.0",
  "mode": "fixture",
  "resultCount": ${runReady ? FIXTURE_RESULTS.length : "null"}
}`}</pre>
              </div>
              <div className="receipt-action">
                <dl className="mini-data">
                  <FieldRow label="Executor key fingerprint" value="Unavailable · local demo key not exposed" muted />
                  <FieldRow label="Receipt object ID" value="Not published" muted />
                  <FieldRow label="Transaction digest" value="Not published" muted />
                  <FieldRow label="Explorer link" value="Unavailable · nothing submitted" muted />
                </dl>
                <button className="primary-button primary-button--light" type="button" disabled={!runReady || receiptState !== "idle"} onClick={simulateReceipt}>
                  {receiptState === "pending" ? "영수증 단계 처리 중…" : receiptReady ? "기록 시뮬레이션 완료" : "영수증 기록 시뮬레이션"}
                  {runReady && receiptState === "idle" && <ArrowIcon />}
                </button>
                <p className="receipt-state" aria-live="polite">
                  {receiptReady ? "로컬 상태만 갱신했습니다. Sui 트랜잭션은 제출되지 않았습니다." : "Fixture mode에서는 온체인 영수증을 생성하지 않습니다."}
                </p>
              </div>
            </div>
          </section>
        </div>
      </section>

      <footer>
        <div className="footer-brand">WORKFLOW<span>/MARKET</span></div>
        <p>Presentation preview · No wallet, license, Walrus, Sui object, or receipt transaction is live.</p>
        <span>Fixture mode</span>
      </footer>
    </main>
  );
}

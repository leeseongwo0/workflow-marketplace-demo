const PROOF_POINTS = [
  {
    number: "01",
    label: "SUI LICENSE",
    title: "Own the right to run",
    description: "릴리스별 실행 권한을 LicensePass로 증명하는 구조입니다. 이 프리뷰에서는 지갑 연결이나 라이선스 발행을 하지 않습니다.",
  },
  {
    number: "02",
    label: "WALRUS BUNDLE",
    title: "Keep the asset encrypted",
    description: "암호화된 워크플로 번들을 Walrus Testnet에 보관하는 흐름을 보여줍니다. 현재 Blob ID는 Not published입니다.",
  },
  {
    number: "03",
    label: "LOCAL EXECUTION",
    title: "Return results, not secrets",
    description: "브라우저 밖의 로컬 서버에서 실행하는 신뢰 경계를 설명합니다. Fixture mode에서는 고정 결과만 사용합니다.",
  },
] as const;

function FixtureBadge() {
  return (
    <span className="fixture-badge">
      <span aria-hidden="true" className="status-dot status-dot--ready" />
      Fixture mode
    </span>
  );
}

export function LandingPage() {
  return (
    <main className="landing-page">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Workflow Market 홈">
          <span className="brand-mark"><span aria-hidden="true" className="spark-icon">✦</span></span>
          <span>WORKFLOW<span className="brand-accent">/MARKET</span></span>
        </a>
        <div className="topbar-actions">
          <FixtureBadge />
          <a className="topbar-cta" href="/app">데모 열기 <span aria-hidden="true">→</span></a>
        </div>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <p className="kicker"><span>LICENSED WORKFLOW ASSETS</span><span>LOCAL PRESENTATION PREVIEW</span></p>
          <h1 id="landing-title">License the workflow.<br /><em>Run the outcome.</em></h1>
          <p>
            AI 워크플로를 버전이 있는 디지털 에셋으로 배포하고, 라이선스를 가진 사용자가
            원본 번들을 받지 않은 채 결과를 실행하는 마켓플레이스입니다.
          </p>
          <div className="landing-actions">
            <a className="landing-primary-link" href="/app">Fixture 데모 시작 <span aria-hidden="true">→</span></a>
            <a className="landing-secondary-link" href="#featured">Featured workflow 보기</a>
          </div>
        </div>

        <aside className="landing-disclosure" aria-label="프리뷰 상태 안내">
          <span className="landing-disclosure-index">PREVIEW / 01</span>
          <div className="landing-radar" aria-hidden="true"><span /></div>
          <div>
            <FixtureBadge />
            <h2>Architecture preview,<br />not a live marketplace.</h2>
            <p>지갑, 라이선스, Walrus 저장, Sui 오브젝트와 영수증 트랜잭션은 연결되어 있지 않습니다.</p>
          </div>
        </aside>
      </section>

      <section className="landing-feature" id="featured" aria-labelledby="featured-title">
        <div className="landing-feature-heading">
          <div>
            <span className="section-label">FEATURED ASSET · 01</span>
            <h2 id="featured-title">A news monitor,<br /><em>packaged to repeat.</em></h2>
          </div>
          <p>하나의 검색어를 받아 최신 24시간의 한국어 Google News RSS 결과를 정규화하는 데모 워크플로입니다.</p>
        </div>

        <article className="landing-asset-card">
          <div className="landing-asset-art" aria-hidden="true">
            <div className="landing-signal landing-signal--outer" />
            <div className="landing-signal landing-signal--middle" />
            <div className="landing-signal landing-signal--core" />
            <span>GN</span>
          </div>
          <div className="landing-asset-info">
            <div className="landing-asset-topline">
              <span>GOOGLE NEWS RSS MONITOR</span>
              <strong>v1.0.0</strong>
            </div>
            <h3>Google News<br />RSS Monitor</h3>
            <p>google_news_rss/v1 · Korean / South Korea</p>
            <dl>
              <div><dt>Price</dt><dd>0.10 Testnet SUI · display only</dd></div>
              <div><dt>Release ID</dt><dd>Not published</dd></div>
              <div><dt>Walrus Blob ID</dt><dd>Not published</dd></div>
            </dl>
            <a className="landing-card-link" href="/app">인터랙티브 데모에서 보기 <span aria-hidden="true">→</span></a>
          </div>
        </article>
      </section>

      <section className="landing-proof" aria-labelledby="proof-title">
        <div className="landing-proof-heading">
          <span className="section-label">THREE BOUNDARIES</span>
          <h2 id="proof-title">What the product is designed to prove</h2>
        </div>
        <ol>
          {PROOF_POINTS.map((point) => (
            <li key={point.number}>
              <div className="proof-meta"><span>{point.number}</span><strong>{point.label}</strong></div>
              <h3>{point.title}</h3>
              <p>{point.description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-final" aria-labelledby="landing-final-title">
        <div>
          <span className="section-label">LOCAL WALKTHROUGH</span>
          <h2 id="landing-final-title">See the buyer journey<br />in one focused screen.</h2>
        </div>
        <div className="landing-final-action">
          <p><strong>Fixture mode</strong> · 화면 상태만 시뮬레이션하며 라이브 서비스에는 연결하지 않습니다.</p>
          <a className="landing-primary-link landing-primary-link--light" href="/app">데모 화면으로 이동 <span aria-hidden="true">→</span></a>
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

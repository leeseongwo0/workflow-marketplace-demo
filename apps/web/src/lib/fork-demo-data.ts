/**
 * Illustrative data for the fork/remix explainer at /fork.
 *
 * None of this is produced by a running agent: the three fork results are
 * written by hand so the page can show the *shape* of the flow without a live
 * model behind it. The page labels them as examples for that reason. The
 * original news items mirror what the real Google News workflow returns.
 */

export interface NewsItem {
  title: string;
  source: string;
  publishedAt: string;
}

export const ORIGINAL = {
  name: "Google News 24h Scraper",
  creator: "Original Creator",
  input: 'keyword: "AI semiconductor"',
  confidentialNote:
    "이 워크플로의 프롬프트와 내부 단계는 공개되지 않습니다. 구매자도 실행 결과만 받습니다.",
} as const;

export const ORIGINAL_OUTPUT: NewsItem[] = [
  {
    title: "NVIDIA, AI 데이터센터 수요로 GPU 주문 급증",
    source: "Reuters",
    publishedAt: "3시간 전",
  },
  {
    title: "미국, 첨단 반도체 수출 규제 추가 검토",
    source: "Bloomberg",
    publishedAt: "7시간 전",
  },
  {
    title: "TSMC·SK하이닉스, HBM 생산능력 확대 논의",
    source: "Nikkei Asia",
    publishedAt: "11시간 전",
  },
];

export interface ForkResultLine {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
}

export interface ForkAgent {
  id: string;
  name: string;
  creator: string;
  summary: string;
  icon: string;
  accent: string;
  lines: ForkResultLine[];
  verdict: { label: string; value: string; tone: "positive" | "negative" | "neutral" };
}

export const FORK_AGENTS: ForkAgent[] = [
  {
    id: "economic-impact",
    name: "Economic Impact Analyst",
    creator: "Bob",
    summary: "뉴스에서 언급된 자산의 시장 영향도를 평가합니다.",
    icon: "📈",
    accent: "from-mint/60 to-lime/40",
    lines: [
      { label: "관련 자산", value: "NVIDIA (NVDA)" },
      { label: "시장 연관도", value: "High" },
      { label: "긍정 요인", value: "AI 데이터센터 수요 확대 · GPU 주문 증가", tone: "positive" },
      { label: "부정 요인", value: "수출 규제 · 공급 제약", tone: "negative" },
      { label: "신뢰도", value: "82%" },
    ],
    verdict: { label: "종합 판단", value: "Bullish", tone: "positive" },
  },
  {
    id: "supply-chain",
    name: "Supply Chain Analyst",
    creator: "Carol",
    summary: "공급망 의존성과 병목 가능성을 추적합니다.",
    icon: "🔗",
    accent: "from-blue/50 to-mint/30",
    lines: [
      { label: "언급 기업", value: "NVIDIA · TSMC · SK하이닉스" },
      { label: "공급망 리스크", value: "Medium", tone: "neutral" },
      { label: "핵심 의존성", value: "HBM / 첨단 패키징" },
      { label: "병목 가능성", value: "High", tone: "negative" },
      {
        label: "요약",
        value: "AI 가속기 수요가 첨단 패키징 capacity 압박을 키울 수 있음",
      },
    ],
    verdict: { label: "종합 판단", value: "Watch", tone: "neutral" },
  },
  {
    id: "morning-brief",
    name: "AI Morning Brief",
    creator: "Dave",
    summary: "뉴스를 아침 브리핑 형식으로 재가공합니다.",
    icon: "☕",
    accent: "from-lime/50 to-mint/30",
    lines: [
      { label: "Top 3", value: "GPU 주문 급증 · 수출 규제 검토 · HBM 증설" },
      { label: "시장 영향 뉴스", value: "수출 규제 추가 검토", tone: "negative" },
      { label: "주목 기업", value: "NVIDIA · TSMC" },
      { label: "한 줄 요약", value: "수요는 강한데 공급·규제가 변수" },
    ],
    verdict: { label: "핵심 시사점", value: "공급 측 뉴스 주시", tone: "neutral" },
  },
];

/** Contract features the diagram above maps onto, quoted for the explainer. */
export const ONCHAIN_BACKING = [
  {
    ui: "Forked from 표시",
    move: "WorkflowRelease.parent_release_id",
    note: "포크 릴리스가 원본을 가리켜 계보가 체인에 남습니다.",
  },
  {
    ui: "포크 권한",
    move: "license::ForkPermit",
    note: "buy_fork_permit 으로 발급되는 객체. 권한 없이는 포크 등록이 불가합니다.",
  },
  {
    ui: "원작자 수익",
    move: "marketplace::buy_fork_permit_with_royalty",
    note: "결제가 플랫폼 수수료 → 원작자 금고 → 판매자 금고 순으로 자동 분배됩니다.",
  },
  {
    ui: "TEE Verified 배지",
    move: "execution::seal_approve + enclave::Enclave",
    note: "실행이 검증된 enclave 안에서 일어났을 때만 복호화 승인이 납니다.",
  },
];

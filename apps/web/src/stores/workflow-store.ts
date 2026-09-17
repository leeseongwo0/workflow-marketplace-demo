import { create } from "zustand";

export type Workflow = {
  id: string;
  name: string;
  priceMist: number;
  users: number;
  likes: number;
  creator: string;
  lastUpdate: string;
  description: string;
  category: "featured" | "trending";
  rank?: number;
  /** Emoji shown on the thumbnail tile; falls back to a blank tile when unset. */
  icon?: string;
  /** Tailwind gradient classes for the thumbnail tile. */
  accent?: string;
  /** Set for workflows backed by a real executable package rather than mock data. */
  workflowType?: string;
  /** Registered through the browser: real on-chain listing, but no bundle to run. */
  onChainOnly?: boolean;
};

export type PurchasedWorkflow = {
  workflowId: string;
  purchasedAt: string;
};

export type WorkflowComment = {
  id: string;
  workflowId: string;
  author: string;
  authorAddress: string;
  body: string;
  createdAt: string;
};

type WorkflowState = {
  workflows: Workflow[];
  purchasedWorkflows: PurchasedWorkflow[];
  likedWorkflowIds: string[];
  comments: WorkflowComment[];
  addWorkflow: (workflow: Workflow) => void;
  updateWorkflow: (workflowId: string, patch: Partial<Workflow>) => void;
  upsertWorkflows: (workflows: Workflow[]) => void;
  purchaseWorkflow: (workflowId: string) => void;
  isPurchased: (workflowId: string) => boolean;
  toggleLike: (workflowId: string) => void;
  isLiked: (workflowId: string) => boolean;
  likeCount: (workflowId: string) => number;
  addComment: (input: {
    workflowId: string;
    author: string;
    authorAddress: string;
    body: string;
  }) => void;
  updateComment: (commentId: string, body: string) => void;
  deleteComment: (commentId: string) => void;
  commentsFor: (workflowId: string) => WorkflowComment[];
};

// The only entry backed by real code: packages/workflow-google-news.
// It is the workflow the Execute page will actually run once the executor
// API is wired up. Everything below it is catalog dressing for the demo.
const GOOGLE_NEWS_WORKFLOW: Workflow = {
  id: "google-news-rss",
  // Curated title. The WorkflowRoot on chain calls it "Google News RSS".
  name: "Google News RSS Monitor",
  // Fallback only: price_license on the deployed WorkflowRelease (0.05 SUI).
  // The live loader overwrites this with whatever the chain actually says.
  priceMist: 50_000_000,
  users: 342,
  likes: 128,
  creator: "Seongwoo Lee",
  lastUpdate: "3 days ago",
  description:
    "검색어를 입력하면 최근 24시간 동안의 Google News 기사를 모아 정리해 주는 워크플로입니다. 중복된 기사를 걸러내고 최신순으로 정렬해 최대 10건을 돌려주며, 실행 결과는 검증 가능한 영수증과 함께 기록됩니다.",
  category: "featured",
  icon: "📰",
  accent: "from-blue/80 to-mint/60",
  workflowType: "google_news_rss/v1",
};

const FEATURED_WORKFLOWS: Workflow[] = [
  {
    id: "github-pr-digest",
    name: "PR Review Digest",
    priceMist: 1200000000,
    users: 218,
    likes: 94,
    creator: "devkim",
    lastUpdate: "5 days ago",
    description:
      "저장소에 열려 있는 Pull Request를 훑어서 리뷰가 밀린 것, 충돌이 난 것, 승인만 남은 것을 구분해 정리해 줍니다. 매일 아침 팀 채널에 붙여넣기 좋은 형태로 나옵니다.",
    category: "featured",
    icon: "🔀",
    accent: "from-purple-500/70 to-blue-500/60",
  },
  {
    id: "invoice-parser",
    name: "Invoice Extractor",
    priceMist: 1800000000,
    users: 176,
    likes: 71,
    creator: "ledgerlab",
    lastUpdate: "1 week ago",
    description:
      "PDF 청구서에서 공급자, 발행일, 품목별 금액, 세액을 뽑아 표 형태로 변환합니다. 양식이 제각각인 청구서를 한 장씩 옮겨 적는 작업을 없애기 위해 만들었습니다.",
    category: "featured",
    icon: "🧾",
    accent: "from-amber-500/70 to-orange-500/60",
  },
  {
    id: "meeting-notes",
    name: "Meeting Recap",
    priceMist: 900000000,
    users: 412,
    likes: 155,
    creator: "Seongwoo Lee",
    lastUpdate: "2 days ago",
    description:
      "회의 녹취록을 넣으면 논의된 주제, 내려진 결정, 담당자가 정해진 할 일을 나눠서 정리해 줍니다. 누가 무엇을 언제까지 하기로 했는지가 따로 표시됩니다.",
    category: "featured",
    icon: "🎙️",
    accent: "from-rose-500/70 to-pink-500/60",
  },
  {
    id: "token-price-alert",
    name: "Token Watchlist",
    priceMist: 600000000,
    users: 289,
    likes: 103,
    creator: "onchain_anna",
    lastUpdate: "4 days ago",
    description:
      "관심 토큰의 가격과 거래량을 주기적으로 확인해서, 설정한 기준을 넘거나 평소와 크게 다른 움직임이 보일 때 요약을 만들어 줍니다.",
    category: "featured",
    icon: "📈",
    accent: "from-emerald-500/70 to-teal-500/60",
  },
];

const TRENDING_WORKFLOWS: Workflow[] = [
  {
    id: "resume-screener",
    name: "Resume Screener",
    priceMist: 1500000000,
    users: 531,
    likes: 214,
    creator: "hrstack",
    lastUpdate: "1 day ago",
    description:
      "채용 공고와 지원서를 함께 넣으면 요구 경력, 기술 스택, 필수 자격 조건이 얼마나 맞는지 항목별로 비교해 줍니다. 판단 근거가 된 문장을 함께 보여 줍니다.",
    icon: "📄",
    accent: "from-sky-500/70 to-indigo-500/60",
    category: "trending",
    rank: 1,
  },
  {
    id: "competitor-watch",
    name: "Competitor Watch",
    priceMist: 2200000000,
    users: 468,
    likes: 187,
    creator: "marketmoss",
    lastUpdate: "3 days ago",
    description:
      "경쟁사의 공지, 가격 정책, 채용 공고 변화를 모아 지난주 대비 무엇이 달라졌는지 정리합니다. 바뀐 부분만 골라서 보여 줍니다.",
    icon: "🛰️",
    accent: "from-violet-500/70 to-fuchsia-500/60",
    category: "trending",
    rank: 2,
  },
  {
    id: "ticket-router",
    name: "Support Triage",
    priceMist: 1100000000,
    users: 403,
    likes: 169,
    creator: "deskflow",
    lastUpdate: "6 days ago",
    description:
      "들어온 문의를 내용에 따라 분류하고 긴급도를 매겨서 담당 팀을 제안합니다. 환불, 장애, 기능 문의처럼 성격이 다른 요청이 섞여 들어올 때 쓰기 좋습니다.",
    icon: "🎫",
    accent: "from-cyan-500/70 to-blue-500/60",
    category: "trending",
    rank: 3,
  },
  {
    id: "review-digest",
    name: "Review Digest",
    priceMist: 800000000,
    users: 377,
    likes: 141,
    creator: "voiceofuser",
    lastUpdate: "1 week ago",
    description:
      "앱스토어와 커뮤니티에 올라온 사용자 후기를 모아 자주 나오는 불만과 칭찬을 주제별로 묶어 줍니다. 원문 링크가 함께 붙습니다.",
    icon: "⭐",
    accent: "from-yellow-500/70 to-amber-500/60",
    category: "trending",
    rank: 4,
  },
  {
    id: "sentiment-tracker",
    name: "Sentiment Tracker",
    priceMist: 1400000000,
    users: 342,
    likes: 128,
    creator: "pulsehq",
    lastUpdate: "2 days ago",
    description:
      "특정 키워드가 언급된 게시물의 분위기가 시간에 따라 어떻게 변했는지 추적합니다. 급격히 나빠진 구간을 표시해 줍니다.",
    icon: "📊",
    accent: "from-lime-500/70 to-green-500/60",
    category: "trending",
    rank: 5,
  },
  {
    id: "seo-keyword-report",
    name: "Keyword Report",
    priceMist: 1700000000,
    users: 298,
    likes: 112,
    creator: "rankcraft",
    lastUpdate: "5 days ago",
    description:
      "목표 키워드의 검색 결과 상위 페이지를 분석해서 어떤 주제를 다루고 있는지, 우리 글에 빠진 내용이 무엇인지 정리해 줍니다.",
    icon: "🔑",
    accent: "from-orange-500/70 to-red-500/60",
    category: "trending",
    rank: 6,
  },
  {
    id: "standup-bot",
    name: "Standup Collector",
    priceMist: 500000000,
    users: 264,
    likes: 96,
    creator: "devkim",
    lastUpdate: "1 week ago",
    description:
      "어제 한 일, 오늘 할 일, 막힌 것을 팀원별로 모아 하나의 스탠드업 노트로 만들어 줍니다. 답을 안 한 사람도 함께 표시됩니다.",
    icon: "☀️",
    accent: "from-amber-400/70 to-yellow-500/60",
    category: "trending",
    rank: 7,
  },
  {
    id: "contract-risk",
    name: "Contract Reader",
    priceMist: 2500000000,
    users: 231,
    likes: 88,
    creator: "clausecheck",
    lastUpdate: "2 weeks ago",
    description:
      "계약서에서 해지 조건, 자동 갱신, 책임 범위, 위약금 조항을 찾아 정리하고 일반적인 기준과 다른 부분을 짚어 줍니다. 법률 자문을 대신하지는 않습니다.",
    icon: "⚖️",
    accent: "from-slate-400/70 to-slate-600/60",
    category: "trending",
    rank: 8,
  },
  {
    id: "translation-pipeline",
    name: "Doc Translator",
    priceMist: 1300000000,
    users: 205,
    likes: 79,
    creator: "linguaflow",
    lastUpdate: "4 days ago",
    description:
      "문서를 번역하면서 코드 블록, 제품명, 고유명사는 원문 그대로 두고 문단 구조와 서식을 유지합니다. 용어집을 함께 넣으면 표현을 통일해 줍니다.",
    icon: "🌐",
    accent: "from-teal-500/70 to-cyan-500/60",
    category: "trending",
    rank: 9,
  },
  {
    id: "filing-digest",
    name: "Filing Digest",
    priceMist: 2100000000,
    users: 188,
    likes: 64,
    creator: "quantdesk",
    lastUpdate: "1 week ago",
    description:
      "기업 공시를 읽고 실적 수치, 사업 전망, 위험 요인에서 직전 공시 대비 달라진 문장을 뽑아 정리합니다.",
    icon: "🏦",
    accent: "from-indigo-500/70 to-violet-500/60",
    category: "trending",
    rank: 10,
  },
];

const MOCK_WORKFLOWS: Workflow[] = [
  GOOGLE_NEWS_WORKFLOW,
  ...FEATURED_WORKFLOWS,
  ...TRENDING_WORKFLOWS,
];

let commentId = 0;

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflows: MOCK_WORKFLOWS,
  purchasedWorkflows: [],
  likedWorkflowIds: [],
  comments: [],
  addWorkflow: (workflow: Workflow) =>
    set((state) => ({
      workflows: [workflow, ...state.workflows],
    })),
  updateWorkflow: (workflowId: string, patch: Partial<Workflow>) =>
    set((state) => ({
      workflows: state.workflows.map((workflow) =>
        workflow.id === workflowId ? { ...workflow, ...patch } : workflow,
      ),
    })),
  upsertWorkflows: (incoming: Workflow[]) =>
    set((state) => {
      const byId = new Map(state.workflows.map((workflow) => [workflow.id, workflow]));
      for (const workflow of incoming) {
        byId.set(workflow.id, { ...byId.get(workflow.id), ...workflow });
      }
      return { workflows: [...byId.values()] };
    }),
  purchaseWorkflow: (workflowId: string) =>
    set((state) => ({
      purchasedWorkflows: [
        ...state.purchasedWorkflows,
        { workflowId, purchasedAt: new Date().toISOString() },
      ],
    })),
  isPurchased: (workflowId: string) =>
    get().purchasedWorkflows.some((p) => p.workflowId === workflowId),
  toggleLike: (workflowId: string) =>
    set((state) => ({
      likedWorkflowIds: state.likedWorkflowIds.includes(workflowId)
        ? state.likedWorkflowIds.filter((id) => id !== workflowId)
        : [...state.likedWorkflowIds, workflowId],
    })),
  isLiked: (workflowId: string) => get().likedWorkflowIds.includes(workflowId),
  likeCount: (workflowId: string) => {
    const workflow = get().workflows.find((w) => w.id === workflowId);
    if (workflow === undefined) return 0;
    return workflow.likes + (get().likedWorkflowIds.includes(workflowId) ? 1 : 0);
  },
  addComment: ({ workflowId, author, authorAddress, body }) =>
    set((state) => ({
      comments: [
        ...state.comments,
        {
          id: `comment-${++commentId}`,
          workflowId,
          author,
          authorAddress,
          body,
          createdAt: new Date().toISOString(),
        },
      ],
    })),
  updateComment: (commentId: string, body: string) =>
    set((state) => ({
      comments: state.comments.map((comment) =>
        comment.id === commentId ? { ...comment, body } : comment,
      ),
    })),
  deleteComment: (commentId: string) =>
    set((state) => ({
      comments: state.comments.filter((comment) => comment.id !== commentId),
    })),
  commentsFor: (workflowId: string) =>
    get().comments.filter((comment) => comment.workflowId === workflowId),
}));

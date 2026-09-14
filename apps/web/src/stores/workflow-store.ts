import { create } from "zustand";

export type Workflow = {
  id: string;
  name: string;
  price: number;
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
};

export type PurchasedWorkflow = {
  workflowId: string;
  purchasedAt: string;
};

export type WorkflowComment = {
  id: string;
  workflowId: string;
  author: string;
  body: string;
  createdAt: string;
};

type WorkflowState = {
  workflows: Workflow[];
  purchasedWorkflows: PurchasedWorkflow[];
  likedWorkflowIds: string[];
  comments: WorkflowComment[];
  addWorkflow: (workflow: Workflow) => void;
  purchaseWorkflow: (workflowId: string) => void;
  isPurchased: (workflowId: string) => boolean;
  toggleLike: (workflowId: string) => void;
  isLiked: (workflowId: string) => boolean;
  likeCount: (workflowId: string) => number;
  addComment: (input: { workflowId: string; author: string; body: string }) => void;
  commentsFor: (workflowId: string) => WorkflowComment[];
};

function createDummyWorkflow(
  suffix: string,
  category: Workflow["category"],
  rank?: number,
): Workflow {
  return {
    id: `workflow-${suffix}`,
    name: `workflow ${suffix}`,
    price: 1000,
    users: 100,
    likes: 76,
    creator: `USER${suffix}`,
    lastUpdate: "1 month ago",
    description: "This workflow helps you to get more money.",
    category,
    ...(rank === undefined ? {} : { rank }),
  };
}

// The only entry backed by real code: packages/workflow-google-news.
// It is the workflow the Execute page will actually run once the executor
// API is wired up, so keep its id and workflowType in sync with the package.
const GOOGLE_NEWS_WORKFLOW: Workflow = {
  id: "google-news-rss",
  name: "Google News Digest",
  price: 1000,
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

const MOCK_WORKFLOWS: Workflow[] = [
  GOOGLE_NEWS_WORKFLOW,
  ...["a", "b", "c", "d"].map((suffix) => createDummyWorkflow(suffix, "featured")),
  ...Array.from({ length: 10 }, (_, index) =>
    createDummyWorkflow(String(index + 1), "trending", index + 1),
  ),
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
  addComment: ({ workflowId, author, body }) =>
    set((state) => ({
      comments: [
        ...state.comments,
        {
          id: `comment-${++commentId}`,
          workflowId,
          author,
          body,
          createdAt: new Date().toISOString(),
        },
      ],
    })),
  commentsFor: (workflowId: string) =>
    get().comments.filter((comment) => comment.workflowId === workflowId),
}));

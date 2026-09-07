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
};

export type PurchasedWorkflow = {
  workflowId: string;
  purchasedAt: string;
};

type WorkflowState = {
  workflows: Workflow[];
  purchasedWorkflows: PurchasedWorkflow[];
  addWorkflow: (workflow: Workflow) => void;
  purchaseWorkflow: (workflowId: string) => void;
  isPurchased: (workflowId: string) => boolean;
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

const MOCK_WORKFLOWS: Workflow[] = [
  ...["a", "b", "c", "d"].map((suffix) => createDummyWorkflow(suffix, "featured")),
  ...Array.from({ length: 10 }, (_, index) =>
    createDummyWorkflow(String(index + 1), "trending", index + 1),
  ),
];

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflows: MOCK_WORKFLOWS,
  purchasedWorkflows: [],
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
}));

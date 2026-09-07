export interface WorkflowStep {
  action: string;
  output_var?: string;
  [key: string]: unknown;
}

export interface WorkflowDefinition {
  name: string;
  version: string;
  steps: WorkflowStep[];
}

export interface WorkflowContext {
  inputs: Record<string, unknown>;
  variables: Record<string, unknown>;
  stepResults: unknown[];
}

export type StepHandler = (
  step: WorkflowStep,
  ctx: WorkflowContext,
) => Promise<unknown>;

export class WorkflowRunner {
  private handlers = new Map<string, StepHandler>();

  constructor() {
    this.register("fetch_document", fetchDocumentHandler);
    this.register("return_result", returnResultHandler);
    this.register("http_request", httpRequestHandler);
    this.register("log", logHandler);
  }

  register(action: string, handler: StepHandler): void {
    this.handlers.set(action, handler);
  }

  async run(
    definition: WorkflowDefinition,
    inputs: Record<string, unknown> = {},
  ): Promise<unknown> {
    const ctx: WorkflowContext = {
      inputs,
      variables: { ...inputs },
      stepResults: [],
    };

    let lastResult: unknown = undefined;
    for (const step of definition.steps) {
      const handler = this.handlers.get(step.action);
      if (!handler) {
        throw new Error(`No handler registered for action: ${step.action}`);
      }
      lastResult = await handler(step, ctx);
      ctx.stepResults.push(lastResult);
      if (step.output_var) {
        ctx.variables[step.output_var] = lastResult;
      }
    }
    return lastResult;
  }

  static parse(data: Uint8Array): WorkflowDefinition {
    const json = new TextDecoder().decode(data);
    const def = JSON.parse(json) as WorkflowDefinition;
    if (!def.name || !def.steps || !Array.isArray(def.steps)) {
      throw new Error("Invalid workflow definition: missing name or steps");
    }
    return def;
  }

  static interpolate(
    template: string,
    variables: Record<string, unknown>,
  ): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => {
      const val = variables[key];
      return val !== undefined ? String(val) : `{${key}}`;
    });
  }
}

const fetchDocumentHandler: StepHandler = async (step, ctx) => {
  const source = (step.source as string) ?? "user_input";
  const value = ctx.variables[source] ?? ctx.inputs[source];
  if (value === undefined) {
    throw new Error(`fetch_document: no input found for source "${source}"`);
  }
  return value;
};

const returnResultHandler: StepHandler = async (_step, ctx) => {
  return ctx.stepResults[ctx.stepResults.length - 1];
};

const httpRequestHandler: StepHandler = async (step, ctx) => {
  const url = WorkflowRunner.interpolate(step.url as string, ctx.variables);
  const method = ((step.method as string) ?? "GET").toUpperCase();
  const headers = (step.headers as Record<string, string>) ?? {};
  const body =
    step.body !== undefined
      ? WorkflowRunner.interpolate(
          typeof step.body === "string"
            ? step.body
            : JSON.stringify(step.body),
          ctx.variables,
        )
      : undefined;

  const res = await fetch(url, {
    method,
    headers,
    body: method !== "GET" && method !== "HEAD" ? body : undefined,
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return res.text();
};

const logHandler: StepHandler = async (step, ctx) => {
  const message = step.message
    ? WorkflowRunner.interpolate(step.message as string, ctx.variables)
    : JSON.stringify(ctx.stepResults[ctx.stepResults.length - 1]);
  console.log(`[workflow:log] ${message}`);
  return ctx.stepResults[ctx.stepResults.length - 1];
};

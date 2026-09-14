import cors from "@fastify/cors";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
} from "fastify";

import type { ExecutionResponse, ExecutionService } from "../execution/execution-service.js";
import type { InMemoryChallengeStore } from "../execution/challenge.js";
import type { SealSessionAuthority } from "../execution/seal-session-authority.js";
import {
  invalidRequestError,
  statusForExecutorError,
  toPublicExecutorError,
} from "./errors.js";
import {
  executionChallengeRequestSchema,
  executionRequestSchema,
} from "./schemas.js";

export interface ExecutorApiOptions {
  challenges: Pick<InMemoryChallengeStore, "issue">;
  executionService: Pick<ExecutionService, "execute">;
  corsOrigin: string;
  /** Omit for executor configurations that don't use Seal (e.g. the
   * LocalDemoKeyProvider path) — the response then carries no
   * sealSessionMessage and the client must not send sealSessionSignature. */
  sealSessions?: Pick<SealSessionAuthority, "begin">;
}

export interface ExecutionChallengeHttpResponse {
  challengeId: string;
  expiresAtMs: number;
  personalMessage: {
    bytesBase64: string;
    preview: string;
  };
  sealSessionMessage?: {
    bytesBase64: string;
  };
}

function sendPublicError(reply: FastifyReply, error: unknown): FastifyReply {
  return reply
    .code(statusForExecutorError(error))
    .send(toPublicExecutorError(error));
}

function challengeResponse(
  challenge: ReturnType<InMemoryChallengeStore["issue"]>,
  sealSessionMessage?: Uint8Array,
): ExecutionChallengeHttpResponse {
  const bytesBase64 = Buffer.from(challenge.message).toString("base64");
  return {
    challengeId: challenge.payload.challengeId,
    expiresAtMs: challenge.payload.expiresAtMs,
    personalMessage: {
      bytesBase64,
      preview: new TextDecoder("utf-8", { fatal: true }).decode(
        challenge.message,
      ),
    },
    ...(sealSessionMessage !== undefined
      ? {
          sealSessionMessage: {
            bytesBase64: Buffer.from(sealSessionMessage).toString("base64"),
          },
        }
      : {}),
  };
}

export function createExecutorApp(
  options: ExecutorApiOptions,
): FastifyInstance {
  if (options.corsOrigin === "*" || options.corsOrigin.includes("*")) {
    throw new Error("Wildcard CORS origins are not permitted");
  }

  const app = Fastify({ logger: false });
  void app.register(cors, {
    origin: async (requestOrigin: string | undefined): Promise<string | boolean> =>
      requestOrigin === undefined || requestOrigin === options.corsOrigin
        ? options.corsOrigin
        : false,
    credentials: false,
  });

  app.post("/api/execution/challenges", async (request, reply) => {
    const parsed = executionChallengeRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendPublicError(reply, invalidRequestError());
    }

    try {
      const challenge = options.challenges.issue(parsed.data);
      const sealSessionMessage = await options.sealSessions?.begin({
        challengeId: challenge.payload.challengeId,
        runnerAddress: challenge.payload.runnerAddress,
      });
      return reply.code(200).send(challengeResponse(challenge, sealSessionMessage));
    } catch (error) {
      return sendPublicError(reply, error);
    }
  });

  app.post("/api/executions", async (request, reply) => {
    const parsed = executionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendPublicError(reply, invalidRequestError());
    }

    try {
      const response: ExecutionResponse = await options.executionService.execute(
        parsed.data,
      );
      return reply.code(200).send(response);
    } catch (error) {
      return sendPublicError(reply, error);
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "FST_ERR_CTP_INVALID_JSON_BODY"
    ) {
      return sendPublicError(reply, invalidRequestError());
    }
    return sendPublicError(reply, new Error("Unhandled executor error"));
  });

  return app;
}

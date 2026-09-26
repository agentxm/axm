import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { codingAgentForId } from "./adapters.js";

const claudeCodeCodingAgent = codingAgentForId("claude-code");
const codexCodingAgent = codingAgentForId("codex");
const geminiCliCodingAgent = codingAgentForId("gemini-cli");

describe("coding-agent services", () => {
  const withNode = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.provide(NodeServices.layer));

  it.effect("claude-code resolves supported directory by default", () =>
    withNode(
      Effect.gen(function* () {
        const outcome = yield* claudeCodeCodingAgent.resolveEffectiveSkillsDir({
          workspaceRoot: "/workspace",
        });

        expect(outcome._tag).toBe("supported");
        if (outcome._tag === "supported") {
          expect(outcome.dir).toContain(".claude/skills");
        }
      }),
    ),
  );

  it.effect("gemini-cli resolves skills directory", () =>
    withNode(
      Effect.gen(function* () {
        const outcome = yield* geminiCliCodingAgent.resolveEffectiveSkillsDir({
          workspaceRoot: "/workspace",
        });

        expect(outcome._tag).toBe("supported");
        if (outcome._tag === "supported") {
          expect(outcome.dir).toContain(".agents/skills");
        }
      }),
    ),
  );

  it.effect("codex resolves skills directory", () =>
    withNode(
      Effect.gen(function* () {
        const outcome = yield* codexCodingAgent.resolveEffectiveSkillsDir({
          workspaceRoot: "/workspace",
        });

        expect(outcome._tag).toBe("supported");
        if (outcome._tag === "supported") {
          expect(outcome.dir).toContain(".agents/skills");
        }
      }),
    ),
  );
});

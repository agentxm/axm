import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { claudeCodeCodingAgent } from "./claude-code/service.js";
import { geminiCliCodingAgent } from "./gemini-cli/service.js";

describe("coding-agent services", () => {
  const withNode = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.provide(NodeContext.layer));

  it.effect("claude-code resolves supported directory by default", () =>
    withNode(
      Effect.gen(function* () {
        const previous = process.env["AXM_CLAUDE_SKILLS_DIR"];
        delete process.env["AXM_CLAUDE_SKILLS_DIR"];

        const outcome = yield* claudeCodeCodingAgent.resolveEffectiveSkillsDir({
          workspaceRoot: "/workspace",
        });

        if (previous !== undefined) {
          process.env["AXM_CLAUDE_SKILLS_DIR"] = previous;
        }

        expect(outcome._tag).toBe("supported");
        if (outcome._tag === "supported") {
          expect(outcome.dir).toContain(".claude/skills");
        }
      }),
    ),
  );

  it.effect("gemini-cli returns misconfigured when override is empty", () =>
    withNode(
      Effect.gen(function* () {
        const previous = process.env["AXM_GEMINI_CLI_SKILLS_DIR"];
        process.env["AXM_GEMINI_CLI_SKILLS_DIR"] = "";

        const outcome = yield* geminiCliCodingAgent.resolveEffectiveSkillsDir({
          workspaceRoot: "/workspace",
        });

        if (previous === undefined) {
          delete process.env["AXM_GEMINI_CLI_SKILLS_DIR"];
        } else {
          process.env["AXM_GEMINI_CLI_SKILLS_DIR"] = previous;
        }

        expect(outcome._tag).toBe("misconfigured");
      }),
    ),
  );
});

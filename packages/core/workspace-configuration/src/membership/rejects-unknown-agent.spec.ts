import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";

import { validateAgentIds } from "./validate-agent-ids.js";

export const specification = defineSpecification({
  requirement: "cli/agents/capabilities/rejects-unknown-agent",
  title: "A request naming an unsupported coding agent is refused with corrective guidance",
  statement:
    "When a membership or capability request names a coding-agent identifier outside the configurable catalog, AXM shall refuse it before any membership change or report is produced and shall name the nearest supported identifier, or how to list the supported identifiers when none is close.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/core/workspace-configuration/src/membership/validate-agent-ids.ts",
    "cli/agent-selection-is-membership-or-filter",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "cli/agent-selection-is-membership-or-filter separately refuses an unsupported id supplied through the --agent option at parse time; whether that rule should cite this one as the authority for corrective guidance, or stay a distinct parse-time rule, is undecided.",
  ],
});

describe("Unsupported coding-agent identifiers", () => {
  it.effect("names the nearest supported identifier for a near miss", () =>
    Effect.gen(function* () {
      const failure = yield* validateAgentIds(["claude-cod"]).pipe(Effect.flip);

      expect(failure.category).toBe("validation");
      expect(failure.detail).toContain("claude-cod");
      expect(failure.suggestions).toEqual([
        expect.objectContaining({
          description: expect.stringContaining("claude-code"),
          cmd: "axm agents add claude-code",
        }),
      ]);
    }),
  );

  it.effect("points at the supported identifiers when nothing is close", () =>
    Effect.gen(function* () {
      const failure = yield* validateAgentIds(["zzzzzzzzzzzzzzzzzzzzzzzzzzzzz"]).pipe(Effect.flip);

      expect(failure.category).toBe("validation");
      expect(failure.suggestions).toEqual([
        expect.objectContaining({ cmd: "axm agents list --available" }),
      ]);
    }),
  );
});

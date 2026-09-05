import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Effect from "effect/Effect";
import { handleAgentsCapabilities, getAppError } from "axm.sh/specification-harness";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { snapshotWorkspaceContent } from "../../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/agents/capabilities/rejects-unknown-agent",
  title: "Unknown coding-agent capability requests name corrective guidance",
  statement:
    "When a capability request names an unknown coding agent, AXM shall reject it with corrective guidance and leave workspace state unchanged.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/agents/capabilities.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Unknown coding-agent capability requests", () => {
  it.effect("rejects an unknown ID and suggests its recognizable correction", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true });
      try {
        const before = snapshotWorkspaceContent(workspace.root);
        const failure = yield* handleAgentsCapabilities("claude-cod").pipe(
          Effect.flip,
          Effect.provide(workspace.layer),
        );
        const error = getAppError(failure);
        expect(error.code).toBe("validation");
        expect(error.detail).toContain("claude-cod");
        expect(JSON.stringify(error)).toContain("claude-code");
        expect(snapshotWorkspaceContent(workspace.root)).toEqual(before);
      } finally {
        workspace.cleanup();
      }
    }),
  );
});

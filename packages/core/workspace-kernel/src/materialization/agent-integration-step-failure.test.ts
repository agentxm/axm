import { describe, expect, it } from "vitest";
import { NativeWriteRefused } from "../agent-adapters/index.js";
import { WorkspaceBoundaryConflict, WorkspaceSnapshotError } from "../settlement/index.js";
import { agentIntegrationFailureToStepFailure } from "./agent-integration-step-failure.js";

describe("native write boundary failure rendering", () => {
  it.each(["overlap", "ambiguous-case"] as const)(
    "keeps a wrapped %s authority refusal actionable",
    (reason) => {
      const conflict = new WorkspaceBoundaryConflict({
        owner: "/workspaces/other",
        target: "/native/config/agent.json",
        conflictingTarget: "/native/config",
        reason,
      });
      const result = agentIntegrationFailureToStepFailure(
        new NativeWriteRefused({
          path: conflict.target,
          cause: new WorkspaceSnapshotError({
            target: conflict.target,
            step: "inspect-target",
            cause: conflict,
          }),
        }),
      );
      expect(result.category).toBe("conflict");
      expect(result.cause).toBe(conflict);
      expect(result.detail).toContain(conflict.owner);
      expect(result.detail).toContain(conflict.target);
      expect(result.detail).toContain(conflict.conflictingTarget);
      if (reason === "ambiguous-case") {
        expect(result.detail).toContain("filesystem case behavior is unresolved");
        expect(result.detail).not.toContain(" overlaps ");
      } else {
        expect(result.detail).toContain(" overlaps ");
      }
    },
  );

  it.each([
    new WorkspaceSnapshotError({ target: "/native", step: "copy", cause: new Error("I/O") }),
    { _tag: "WorkspaceSnapshotError", cause: { _tag: "WorkspaceBoundaryConflict" } },
  ])("keeps unrelated snapshot errors internal", (cause) => {
    const result = agentIntegrationFailureToStepFailure(
      new NativeWriteRefused({ path: "/native", cause }),
    );
    expect(result.category).toBe("internal");
    expect(result.detail).toBe("Failed to snapshot native write target /native");
    expect(result.cause).toBe(cause);
  });
});

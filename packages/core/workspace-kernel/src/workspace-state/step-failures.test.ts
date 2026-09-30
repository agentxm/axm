import { describe, expect, it } from "vitest";
import { WorkspaceBoundaryConflict, WorkspaceSnapshotError } from "../settlement/index.js";
import { workspaceTransactionFailureToStepFailure } from "./step-failures.js";

describe("transaction boundary failure rendering", () => {
  it.each(["overlap", "ambiguous-spelling"] as const)(
    "preserves the typed %s refusal and identifies its holder and targets",
    (reason) => {
      const conflict = new WorkspaceBoundaryConflict({
        owner: "/workspaces/other",
        target: "/native/config/agent.json",
        conflictingTarget: "/native/config",
        reason,
      });
      const result = workspaceTransactionFailureToStepFailure(
        new WorkspaceSnapshotError({
          target: conflict.target,
          step: "inspect-target",
          cause: conflict,
        }),
      );
      expect(result.category).toBe("conflict");
      expect(result.cause).toBe(conflict);
      expect(result.detail).toContain(conflict.owner);
      expect(result.detail).toContain(conflict.target);
      expect(result.detail).toContain(conflict.conflictingTarget);
      if (reason === "ambiguous-spelling") {
        expect(result.detail).toContain("filesystem spelling equivalence is unresolved");
        expect(result.detail).not.toContain(" overlaps ");
      } else {
        expect(result.detail).toContain(" overlaps ");
      }
    },
  );

  it.each([
    new Error("permission denied"),
    { _tag: "WorkspaceBoundaryConflict", owner: "/other", target: "/native" },
  ])("keeps an unrelated snapshot failure internal", (cause) => {
    const result = workspaceTransactionFailureToStepFailure(
      new WorkspaceSnapshotError({ target: "/native", step: "copy", cause }),
    );
    expect(result.category).toBe("internal");
    expect(result.detail).toBe("Failed to snapshot transaction target /native");
    expect(result.cause).toBe(cause);
  });
});

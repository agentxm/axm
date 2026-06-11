import { describe, expect, it } from "vitest";
import { toJobStepResult } from "./job-step-result.js";

describe("commands toJobStepResult", () => {
  it("preserves success artifacts", () => {
    const result = toJobStepResult({
      result: "success",
      message: "Enabled my-cmd",
      artifact: {
        path: ".claude/commands/my-cmd.md",
        scope: "project",
        change: "updated",
        fileCount: 1,
      },
    });

    expect(result).toEqual({
      result: "success",
      message: "Enabled my-cmd",
      artifact: {
        path: ".claude/commands/my-cmd.md",
        scope: "project",
        change: "updated",
        fileCount: 1,
      },
    });
  });
});

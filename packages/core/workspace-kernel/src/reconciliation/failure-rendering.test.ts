import { describe, expect, it } from "vitest";

import { installRefused } from "../operations/index.js";
import { syncRefused } from "./errors.js";
import { kernelFailureToStepFailure } from "./failure-rendering.js";

describe("kernel failure rendering", () => {
  it("names an operation refusal by the family that refused it", () => {
    const lifecycle = installRefused({
      category: "not_found",
      detail: 'skill "demo" is not installed',
    });
    const sync = syncRefused({
      category: "conflict",
      detail: "A managed region on AGENTS.md is owned by another writer.",
    });

    const lifecycleFailure = kernelFailureToStepFailure(lifecycle);
    expect(lifecycleFailure.category).toBe("not_found");
    expect(lifecycleFailure.detail).toBe('skill "demo" is not installed');
    expect(lifecycleFailure.diagnostic).toEqual({
      kind: "extension-lifecycle-failed",
      operation: "workspace.operation",
    });
    expect(lifecycleFailure.cause).toBe(lifecycle);

    const syncFailure = kernelFailureToStepFailure(sync);
    expect(syncFailure.category).toBe("conflict");
    expect(syncFailure.detail).toBe("A managed region on AGENTS.md is owned by another writer.");
    expect(syncFailure.diagnostic).toEqual({
      kind: "workspace-sync-failed",
      operation: "workspace.operation",
    });
    expect(syncFailure.cause).toBe(sync);
  });
});

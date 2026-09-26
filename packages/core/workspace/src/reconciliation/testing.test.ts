import { describe, expect } from "vitest";
import { it } from "@effect/vitest";

import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";

import { ExtensionLifecycleFailed, StepFailure } from "../operations/index.js";
import { StepFailureConversion, WorkspaceSyncFailed } from "./index.js";
import { WorkspaceRestorationIncomplete } from "../transitions/settlement/index.js";
import { StepFailureConversionTest } from "./testing.js";

describe("./testing.js", () => {
  it.effect("renders an operation refusal one-to-one", () =>
    Effect.gen(function* () {
      const conversion = yield* StepFailureConversion;
      const refusal = new ExtensionLifecycleFailed({
        category: "not_found",
        title: "Not installed",
        detail: 'skill "missing" is not installed',
        recover: "List what is installed.",
        cmd: "axm list",
        suggestions: [{ description: "Install it first." }],
      });
      const stepFailure = conversion.toStepFailure(refusal);
      expect(stepFailure).toBeInstanceOf(StepFailure);
      expect(stepFailure.category).toBe("not_found");
      expect(stepFailure.title).toBe("Not installed");
      expect(stepFailure.detail).toBe('skill "missing" is not installed');
      expect(stepFailure.suggestions).toEqual([
        { description: "List what is installed.", cmd: "axm list" },
        { description: "Install it first." },
      ]);
    }).pipe(Effect.provide(StepFailureConversionTest)),
  );

  it.effect("keeps any other failure's own category and sentence", () =>
    Effect.gen(function* () {
      const conversion = yield* StepFailureConversion;
      const failure = new WorkspaceSyncFailed({
        category: "conflict",
        detail: "A managed region on AGENTS.md is owned by another writer.",
      });
      const stepFailure = conversion.toStepFailure(failure);
      expect(stepFailure.category).toBe("conflict");
      expect(stepFailure.detail).toBe("A managed region on AGENTS.md is owned by another writer.");
      expect(stepFailure.cause).toBe(failure);
    }).pipe(Effect.provide(StepFailureConversionTest)),
  );

  it.effect("names a failure that carries no category as internal", () =>
    Effect.gen(function* () {
      const conversion = yield* StepFailureConversion;
      const failure = new WorkspaceRestorationIncomplete({
        terminationCause: "failure",
        transitionCause: Cause.fail("disk full"),
        restorationCause: "restore failed",
        snapshotDir: undefined,
        retained: [],
      });
      const stepFailure = conversion.toStepFailure(failure);
      expect(stepFailure.category).toBe("internal");
      expect(stepFailure.cause).toBe(failure);
    }).pipe(Effect.provide(StepFailureConversionTest)),
  );
});

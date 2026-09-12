import { describe, expect } from "vitest";
import { it } from "@effect/vitest";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { OperationJournal } from "@agentxm/workspace-operations";

import { WorkspaceSyncFailed } from "@agentxm/workspace-reconciliation";
import { SyncStepFailureConversion } from "@agentxm/workspace-reconciliation";
import { makeSyncPortsTest, structuralSyncStepFailure, syncRequest } from "./testing.js";

describe("@agentxm/workspace-sync/testing", () => {
  it("carries a sync failure's own category and detail into the step failure", () => {
    const failure = new WorkspaceSyncFailed({
      category: "conflict",
      detail: "A managed region on AGENTS.md is owned by another writer.",
    });
    const stepFailure = structuralSyncStepFailure(failure);
    expect(stepFailure.category).toBe("conflict");
    expect(stepFailure.detail).toBe("A managed region on AGENTS.md is owned by another writer.");
    expect(stepFailure.cause).toBe(failure);
  });

  it.effect("composes the services every sync run opens once per invocation", () => {
    const ports = makeSyncPortsTest();
    return Effect.gen(function* () {
      const conversion = yield* SyncStepFailureConversion;
      expect(
        conversion.toStepFailure(
          new WorkspaceSyncFailed({ category: "validation", detail: "Nothing to reconcile." }),
        ).detail,
      ).toBe("Nothing to reconcile.");
      // A run that has presented nothing has asked a person for nothing.
      expect(ports.interaction.presentPlanCalls).toEqual([]);
      expect(ports.interaction.confirmApplyChangesCalls).toEqual([]);
      expect(yield* OperationJournal).toBeDefined();
    }).pipe(Effect.provide(ports.layer));
  });

  it("admits a whole-workspace sweep by default", () => {
    const request = syncRequest();
    expect(Option.isNone(request.target)).toBe(true);
    expect(Option.isNone(request.type)).toBe(true);
    expect(Option.getOrThrow(syncRequest({ type: Option.some("skill") }).type)).toBe("skill");
  });
});

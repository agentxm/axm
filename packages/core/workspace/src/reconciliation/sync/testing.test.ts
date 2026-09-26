import { describe, expect } from "vitest";
import { it } from "@effect/vitest";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { OperationJournal } from "../../operations/index.js";

import { StepFailureConversion, WorkspaceSyncFailed } from "../index.js";
import { makeSyncPortsTest, syncRequest } from "./testing.js";

describe("./testing.js", () => {
  it.effect("composes the services every sync run opens once per invocation", () => {
    const ports = makeSyncPortsTest();
    return Effect.gen(function* () {
      const conversion = yield* StepFailureConversion;
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

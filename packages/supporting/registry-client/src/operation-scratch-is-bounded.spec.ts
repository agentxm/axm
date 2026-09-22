import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Result from "effect/Result";
import * as Scope from "effect/Scope";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  MAX_ACQUIRED_TREE_BYTES,
  MAX_OPERATION_SCRATCH_BYTES,
  makeOperationScratchBudget,
} from "./scratch-budget.js";

export const specification = defineSpecification({
  requirement: "registry-client/operation-scratch-is-bounded",
  title: "Source acquisitions share an operation scratch limit",
  statement:
    "AXM shall reserve finite scratch capacity before source acquisition, refuse over-capacity work with a typed resource failure, release unused capacity after measuring the acquired tree, and release retained capacity when its resource scope closes.",
  class: "functional",
  role: "supporting",
  goals: ["safe-repetition", "trustworthy-distribution"],
  boundary: "platform",
  boundaryRationale:
    "Controlled child scopes and small capacities make admission, refinement, refusal, and release observable without allocating large files.",
  methods: ["boundary-value", "example"],
  derivedFrom: ["docs/architecture/workspace/execution.md"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Operation scratch budget", () => {
  it("declares finite positive source and operation limits", () => {
    expect(MAX_ACQUIRED_TREE_BYTES).toBeGreaterThan(0);
    expect(MAX_OPERATION_SCRATCH_BYTES).toBeGreaterThan(MAX_ACQUIRED_TREE_BYTES);
    expect(Number.isSafeInteger(MAX_OPERATION_SCRATCH_BYTES)).toBe(true);
  });

  it.effect("refuses excess capacity and releases unused and closed reservations", () =>
    Effect.gen(function* () {
      const budget = yield* makeOperationScratchBudget(10);
      const parent = yield* Scope.Scope;
      const firstScope = yield* Scope.fork(parent);
      const first = yield* budget.reserve(7).pipe(Effect.provideService(Scope.Scope, firstScope));

      const denied = yield* Effect.result(budget.reserve(4));
      expect(Result.isFailure(denied)).toBe(true);
      if (Result.isFailure(denied))
        expect(denied.failure._tag).toBe("OperationScratchLimitExceeded");

      yield* first.settle(3);
      const second = yield* budget.reserve(4);
      yield* second.settle(4);
      yield* Scope.close(firstScope, Exit.void);
      yield* budget.reserve(6);
    }).pipe(Effect.scoped),
  );

  it.effect("releases a reservation when acquisition is interrupted", () =>
    Effect.gen(function* () {
      const budget = yield* makeOperationScratchBudget(7);
      const reserved = yield* Deferred.make<void>();
      const acquiring = yield* Effect.scoped(
        Effect.gen(function* () {
          yield* budget.reserve(7);
          yield* Deferred.succeed(reserved, undefined);
          return yield* Effect.never;
        }),
      ).pipe(Effect.forkChild);
      yield* Deferred.await(reserved);

      const denied = yield* Effect.result(budget.reserve(7));
      expect(Result.isFailure(denied)).toBe(true);
      yield* Fiber.interrupt(acquiring);
      yield* budget.reserve(7);
    }).pipe(Effect.scoped),
  );
});

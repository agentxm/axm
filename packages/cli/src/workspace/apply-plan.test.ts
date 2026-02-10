/**
 * Unit tests for applyPlan.
 *
 * Tests the executor registry pattern: dispatches steps expected to succeed
 * to handlers keyed by name, skips non-success steps, catches OperationError.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { applyPlan, OperationError } from "./apply-plan.js";
import type { OperationResult } from "./plan.js";
import type { Operation, Plan, PlannedJobStep } from "./plan.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

type TestOp = Operation<"test-op", { label: string }>;

const makeOp = (label: string): TestOp => ({ name: "test-op", args: { label } });

const makePlan = (overrides: Partial<Plan<TestOp>> = {}): Plan<TestOp> => ({
  name: "Test plan",
  description: Option.none(),
  jobs: [],
  ...overrides,
});

const successHandler = (op: TestOp): Effect.Effect<OperationResult> =>
  Effect.succeed({ result: "success", message: `Installed ${op.args.label}` });

const errorHandler = (op: TestOp): Effect.Effect<OperationResult, OperationError> =>
  Effect.fail(
    new OperationError({
      operation: "test-op",
      message: `Failed to install ${op.args.label}`,
      cause: null,
    }),
  );

const noopResultHandler = (op: TestOp): Effect.Effect<OperationResult> =>
  Effect.succeed({ result: "no-op", message: `Already installed ${op.args.label}` });

const makeStep = (
  label: string,
  expectedResult: OperationResult = { result: "success", message: `Installed ${label}` },
): PlannedJobStep<TestOp> => ({
  _tag: "PlannedJobStep",
  operation: makeOp(label),
  expectedResult,
  label,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("applyPlan", () => {
  it.effect("dispatches steps expected to succeed to handler by name", () =>
    Effect.gen(function* () {
      const applied = yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [makeStep("commit"), makeStep("review-pr")],
            },
          ],
        }),
        { "test-op": successHandler },
      );

      const steps = applied.jobs.flatMap((j) => j.steps);
      expect(steps).toHaveLength(2);
      expect(steps[0]).toMatchObject({
        _tag: "JobStepResult",
        actualResult: { result: "success", message: "Installed commit" },
      });
      expect(steps[1]).toMatchObject({
        _tag: "JobStepResult",
        actualResult: { result: "success", message: "Installed review-pr" },
      });
    }),
  );

  it.effect("skips steps with no-op expected result", () =>
    Effect.gen(function* () {
      const applied = yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                makeStep("commit"),
                makeStep("review-pr", { result: "no-op", message: "already installed" }),
              ],
            },
          ],
        }),
        { "test-op": successHandler },
      );

      const steps = applied.jobs.flatMap((j) => j.steps);
      expect(steps).toHaveLength(2);
      expect(steps[0]).toMatchObject({
        _tag: "JobStepResult",
        actualResult: { result: "success", message: "Installed commit" },
      });
      expect(steps[1]).toMatchObject({
        _tag: "JobStepResult",
        actualResult: { result: "no-op", message: "already installed" },
      });
    }),
  );

  it.effect("returns no-op results when all steps expect no-op", () =>
    Effect.gen(function* () {
      const applied = yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                makeStep("commit", { result: "no-op", message: "already installed" }),
                makeStep("review-pr", { result: "no-op", message: "already installed" }),
              ],
            },
          ],
        }),
        { "test-op": successHandler },
      );

      const steps = applied.jobs.flatMap((j) => j.steps);
      expect(steps).toHaveLength(2);
      expect(
        steps.every(
          (s) =>
            s._tag === "JobStepResult" && "actualResult" in s && s.actualResult.result === "no-op",
        ),
      ).toBe(true);
    }),
  );

  it.effect("respects job concurrency setting", () =>
    Effect.gen(function* () {
      const order: string[] = [];
      const trackingHandler = (op: TestOp): Effect.Effect<OperationResult> =>
        Effect.sync(() => {
          order.push(op.args.label);
          return { result: "success" as const, message: `Installed ${op.name}` };
        });

      yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: 1,
              steps: [makeStep("first"), makeStep("second")],
            },
          ],
        }),
        { "test-op": trackingHandler },
      );

      expect(order).toEqual(["first", "second"]);
    }),
  );

  it.effect("processes multiple jobs", () =>
    Effect.gen(function* () {
      const applied = yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [makeStep("commit")],
            },
            {
              concurrency: 1,
              steps: [makeStep("review-pr")],
            },
          ],
        }),
        { "test-op": successHandler },
      );

      const steps = applied.jobs.flatMap((j) => j.steps);
      expect(steps).toHaveLength(2);
      expect(steps[0]).toMatchObject({
        _tag: "JobStepResult",
        actualResult: { result: "success", message: "Installed commit" },
      });
      expect(steps[1]).toMatchObject({
        _tag: "JobStepResult",
        actualResult: { result: "success", message: "Installed review-pr" },
      });
    }),
  );

  it.effect("catches OperationError and converts to error result", () =>
    Effect.gen(function* () {
      const applied = yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: 1,
              steps: [makeStep("bad")],
            },
          ],
        }),
        { "test-op": errorHandler },
      );

      const steps = applied.jobs.flatMap((j) => j.steps);
      expect(steps).toHaveLength(1);
      expect(steps[0]).toMatchObject({
        _tag: "JobStepResult",
        actualResult: { result: "error", message: "Failed to install bad" },
      });
    }),
  );

  it.effect("handler can return no-op result directly", () =>
    Effect.gen(function* () {
      const applied = yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: 1,
              steps: [makeStep("skip")],
            },
          ],
        }),
        { "test-op": noopResultHandler },
      );

      const steps = applied.jobs.flatMap((j) => j.steps);
      expect(steps).toHaveLength(1);
      expect(steps[0]).toMatchObject({
        _tag: "JobStepResult",
        actualResult: { result: "no-op", message: "Already installed skip" },
      });
    }),
  );

  it.effect("returns empty plan for empty plan", () =>
    Effect.gen(function* () {
      const applied = yield* applyPlan(makePlan({ jobs: [] }), { "test-op": successHandler });

      expect(applied.jobs).toEqual([]);
    }),
  );
});

describe("OperationError", () => {
  it("constructs with operation, message, and cause", () => {
    const error = new OperationError({
      operation: "install-skill",
      message: "Path traversal detected",
      cause: null,
    });

    expect(error._tag).toBe("OperationError");
    expect(error.operation).toBe("install-skill");
    expect(error.message).toBe("Path traversal detected");
    expect(error.cause).toBe(null);
  });

  it("preserves original cause", () => {
    const originalError = new Error("EACCES");
    const error = new OperationError({
      operation: "install-skill",
      message: "Copy failed",
      cause: originalError,
    });

    expect(error.cause).toBe(originalError);
  });
});

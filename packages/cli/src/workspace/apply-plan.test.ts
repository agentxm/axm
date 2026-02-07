/**
 * Unit tests for applyPlan.
 *
 * Tests the executor registry pattern: dispatches execute actions to handlers
 * keyed by _tag, skips no-op actions, catches OperationError.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { applyPlan, OperationError, type OperationResult } from "./apply-plan.js";
import type { Plan } from "./plan.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

type TestOp = { readonly _tag: "test-op"; readonly name: string };

const makeOp = (name: string): TestOp => ({ _tag: "test-op", name });

const makePlan = (overrides: Partial<Plan<TestOp>> = {}): Plan<TestOp> => ({
  name: "Test plan",
  description: Option.none(),
  jobs: [],
  ...overrides,
});

const successHandler = (op: TestOp): Effect.Effect<OperationResult> =>
  Effect.succeed({ action: "success", message: `Installed ${op.name}` });

const errorHandler = (op: TestOp): Effect.Effect<OperationResult, OperationError> =>
  Effect.fail(
    new OperationError({
      operation: "test-op",
      message: `Failed to install ${op.name}`,
      cause: null,
    }),
  );

const noopResultHandler = (op: TestOp): Effect.Effect<OperationResult> =>
  Effect.succeed({ action: "no-op", message: `Already installed ${op.name}` });

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("applyPlan", () => {
  it.effect("dispatches execute actions to handler by _tag", () =>
    Effect.gen(function* () {
      const results = yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                { op: makeOp("commit"), action: "execute", reason: Option.none(), label: "commit" },
                {
                  op: makeOp("review-pr"),
                  action: "execute",
                  reason: Option.none(),
                  label: "review-pr",
                },
              ],
            },
          ],
        }),
        { "test-op": successHandler },
      );

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ action: "success", message: "Installed commit" });
      expect(results[1]).toEqual({ action: "success", message: "Installed review-pr" });
    }),
  );

  it.effect("skips no-op actions", () =>
    Effect.gen(function* () {
      const results = yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                { op: makeOp("commit"), action: "execute", reason: Option.none(), label: "commit" },
                {
                  op: makeOp("review-pr"),
                  action: "no-op",
                  reason: Option.some("already installed"),
                  label: "review-pr",
                },
              ],
            },
          ],
        }),
        { "test-op": successHandler },
      );

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ action: "success", message: "Installed commit" });
      expect(results[1]).toEqual({ action: "no-op", message: "Skipped: review-pr" });
    }),
  );

  it.effect("returns no-op results when all actions are no-op", () =>
    Effect.gen(function* () {
      const results = yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                {
                  op: makeOp("commit"),
                  action: "no-op",
                  reason: Option.some("already installed"),
                  label: "commit",
                },
                {
                  op: makeOp("review-pr"),
                  action: "no-op",
                  reason: Option.some("already installed"),
                  label: "review-pr",
                },
              ],
            },
          ],
        }),
        { "test-op": successHandler },
      );

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.action === "no-op")).toBe(true);
    }),
  );

  it.effect("respects job concurrency setting", () =>
    Effect.gen(function* () {
      const order: string[] = [];
      const trackingHandler = (op: TestOp): Effect.Effect<OperationResult> =>
        Effect.sync(() => {
          order.push(op.name);
          return { action: "success" as const, message: `Installed ${op.name}` };
        });

      yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: 1,
              steps: [
                { op: makeOp("first"), action: "execute", reason: Option.none(), label: "first" },
                {
                  op: makeOp("second"),
                  action: "execute",
                  reason: Option.none(),
                  label: "second",
                },
              ],
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
      const results = yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                { op: makeOp("commit"), action: "execute", reason: Option.none(), label: "commit" },
              ],
            },
            {
              concurrency: 1,
              steps: [
                {
                  op: makeOp("review-pr"),
                  action: "execute",
                  reason: Option.none(),
                  label: "review-pr",
                },
              ],
            },
          ],
        }),
        { "test-op": successHandler },
      );

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ action: "success", message: "Installed commit" });
      expect(results[1]).toEqual({ action: "success", message: "Installed review-pr" });
    }),
  );

  it.effect("catches OperationError and converts to error result", () =>
    Effect.gen(function* () {
      const results = yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: 1,
              steps: [
                { op: makeOp("bad"), action: "execute", reason: Option.none(), label: "bad" },
              ],
            },
          ],
        }),
        { "test-op": errorHandler },
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ action: "error", message: "Failed to install bad" });
    }),
  );

  it.effect("handler can return no-op result directly", () =>
    Effect.gen(function* () {
      const results = yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: 1,
              steps: [
                { op: makeOp("skip"), action: "execute", reason: Option.none(), label: "skip" },
              ],
            },
          ],
        }),
        { "test-op": noopResultHandler },
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ action: "no-op", message: "Already installed skip" });
    }),
  );

  it.effect("returns empty array for empty plan", () =>
    Effect.gen(function* () {
      const results = yield* applyPlan(makePlan({ jobs: [] }), { "test-op": successHandler });

      expect(results).toEqual([]);
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

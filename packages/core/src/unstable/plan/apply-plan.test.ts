/**
 * Unit tests for applyPlan.
 *
 * Tests the readiness model: ready steps execute their run closures,
 * error steps are promoted to error results without execution.
 * Also tests inter-job blocking and intra-job continuation.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "../app-error/index.js";
import { at } from "../test-helpers.js";
import { applyPlan } from "./apply-plan.js";
import type { Plan, PlannedJobStep } from "./plan.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeReadyStep = (label: string, message?: string): PlannedJobStep => ({
  readiness: "ready",
  label,
  run: Effect.succeed({ result: "success", message: message ?? `Done ${label}` }),
});

const makeWarnStep = (label: string, warnMessage: string): PlannedJobStep => ({
  readiness: "warn",
  warnMessage,
  label,
  run: Effect.succeed({ result: "success", message: `Done ${label}` }),
});

const makeErrorStep = (label: string, errorMessage: string): PlannedJobStep => ({
  readiness: "error",
  errorMessage,
  label,
});

const makeFailingReadyStep = (label: string): PlannedJobStep => ({
  readiness: "ready",
  label,
  run: Effect.fail(
    makeAppError({
      code: "internal",
      message: `Failed ${label}`,
    }),
  ),
});

const makePlan = (overrides: Partial<Plan> = {}): Plan => ({
  _tag: "Plan",
  name: "Test plan",
  description: Option.none(),
  jobs: [],
  ...overrides,
});

// -----------------------------------------------------------------------------
// Task 1.1: Plan type readiness model tests
// -----------------------------------------------------------------------------

describe("applyPlan", () => {
  it.effect("executes ready steps via their run closures", () =>
    Effect.gen(function* () {
      const executed = yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [makeReadyStep("commit"), makeReadyStep("review-pr")],
            },
          ],
        }),
      );

      const steps = executed.jobs.flatMap((j) => j.steps);
      expect(steps).toHaveLength(2);
      expect(steps[0]).toMatchObject({
        label: "commit",
        result: { result: "success", message: "Done commit" },
      });
      expect(steps[1]).toMatchObject({
        label: "review-pr",
        result: { result: "success", message: "Done review-pr" },
      });
    }),
  );

  it.effect("promotes error steps to error results without execution", () =>
    Effect.gen(function* () {
      const executed = yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: 1,
              steps: [makeErrorStep("blocked", "depends on pack @org/pack")],
            },
          ],
        }),
      );

      const steps = executed.jobs.flatMap((j) => j.steps);
      expect(steps).toHaveLength(1);
      expect(steps[0]).toMatchObject({
        label: "blocked",
        result: { result: "error", message: "depends on pack @org/pack" },
      });
    }),
  );

  it.effect("catches AppError from run closure and converts to error result", () =>
    Effect.gen(function* () {
      const executed = yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: 1,
              steps: [makeFailingReadyStep("bad")],
            },
          ],
        }),
      );

      const steps = executed.jobs.flatMap((j) => j.steps);
      expect(steps).toHaveLength(1);
      expect(steps[0]).toMatchObject({
        label: "bad",
        result: { result: "error" },
      });
      const result = at(steps, 0).result;
      expect(result.result).toBe("error");
      if (result.result === "error") {
        expect(result.error.code).toBe("internal");
      }
    }),
  );

  it.effect("executes warn steps via their run closures (applyPlan does not gate warns)", () =>
    Effect.gen(function* () {
      const executed = yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: 1,
              steps: [makeWarnStep("cautious", "may conflict")],
            },
          ],
        }),
      );

      const steps = executed.jobs.flatMap((j) => j.steps);
      expect(steps).toHaveLength(1);
      expect(steps[0]).toMatchObject({
        label: "cautious",
        result: { result: "success", message: "Done cautious" },
      });
    }),
  );

  it.effect("returns empty executed plan for empty plan", () =>
    Effect.gen(function* () {
      const executed = yield* applyPlan(makePlan({ jobs: [] }));
      expect(executed.jobs).toEqual([]);
    }),
  );

  it.effect("respects job concurrency setting", () =>
    Effect.gen(function* () {
      const order: string[] = [];
      const trackingStep = (label: string): PlannedJobStep => ({
        readiness: "ready",
        label,
        run: Effect.sync(() => {
          order.push(label);
          return { result: "success" as const, message: `Done ${label}` };
        }),
      });

      yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: 1,
              steps: [trackingStep("first"), trackingStep("second")],
            },
          ],
        }),
      );

      expect(order).toEqual(["first", "second"]);
    }),
  );

  // ---------------------------------------------------------------------------
  // Task 1.2: Inter-job blocking and intra-job continuation
  // ---------------------------------------------------------------------------

  it.effect("blocks subsequent jobs when a step in earlier job fails at runtime", () =>
    Effect.gen(function* () {
      const executed = yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: 1,
              steps: [makeReadyStep("step-a"), makeFailingReadyStep("step-b")],
            },
            {
              concurrency: 1,
              steps: [makeReadyStep("step-c")],
            },
          ],
        }),
      );

      // Job 1: step-a succeeds, step-b fails
      const job1Steps = at(executed.jobs, 0).steps;
      expect(at(job1Steps, 0)).toMatchObject({
        label: "step-a",
        result: { result: "success" },
      });
      expect(at(job1Steps, 1)).toMatchObject({
        label: "step-b",
        result: { result: "error" },
      });

      // Job 2: step-c is blocked (promoted to error without execution)
      const job2Steps = at(executed.jobs, 1).steps;
      expect(at(job2Steps, 0)).toMatchObject({
        label: "step-c",
        result: { result: "error" },
      });
    }),
  );

  it.effect("continues executing sibling steps in same job after failure (intra-job)", () =>
    Effect.gen(function* () {
      const executed = yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [makeFailingReadyStep("step-a"), makeReadyStep("step-b")],
            },
          ],
        }),
      );

      const steps = at(executed.jobs, 0).steps;
      // step-a fails but step-b still runs
      expect(at(steps, 0)).toMatchObject({
        label: "step-a",
        result: { result: "error" },
      });
      expect(at(steps, 1)).toMatchObject({
        label: "step-b",
        result: { result: "success" },
      });
    }),
  );

  it.effect("blocks job N+2 when job N fails even if job N+1 would succeed", () =>
    Effect.gen(function* () {
      const executed = yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: 1,
              steps: [makeFailingReadyStep("fail-step")],
            },
            {
              concurrency: 1,
              steps: [makeReadyStep("blocked-1")],
            },
            {
              concurrency: 1,
              steps: [makeReadyStep("blocked-2")],
            },
          ],
        }),
      );

      expect(at(at(executed.jobs, 0).steps, 0)).toMatchObject({
        result: { result: "error" },
      });
      expect(at(at(executed.jobs, 1).steps, 0)).toMatchObject({
        label: "blocked-1",
        result: { result: "error" },
      });
      expect(at(at(executed.jobs, 2).steps, 0)).toMatchObject({
        label: "blocked-2",
        result: { result: "error" },
      });
    }),
  );

  it.effect("preserves plan structure in executed plan", () =>
    Effect.gen(function* () {
      const executed = yield* applyPlan(
        makePlan({
          name: "My plan",
          description: Option.some("Description"),
          jobs: [
            {
              concurrency: "unbounded",
              steps: [makeReadyStep("a")],
            },
            {
              concurrency: 1,
              steps: [makeReadyStep("b"), makeReadyStep("c")],
            },
          ],
        }),
      );

      expect(executed.name).toBe("My plan");
      expect(executed.description).toEqual(Option.some("Description"));
      expect(executed.jobs).toHaveLength(2);
      expect(at(executed.jobs, 0).steps).toHaveLength(1);
      expect(at(executed.jobs, 1).steps).toHaveLength(2);
    }),
  );
});

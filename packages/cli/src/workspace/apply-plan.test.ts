/**
 * Unit tests for applyPlan.
 *
 * Tests the executor registry pattern: dispatches steps with ready/warn
 * readiness to handlers keyed by name, promotes skip/error steps without
 * dispatch, catches CliError.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { type CliError, makeCliError } from "../cli-error/index.js";
import { applyPlan } from "./apply-plan.js";
import type { OperationResult, Readiness } from "./plan.js";
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

const errorHandler = (op: TestOp): Effect.Effect<OperationResult, CliError> =>
  Effect.fail(
    makeCliError({
      code: "TEST_OP_FAILED",
      what: `Failed to install ${op.args.label}`,
    }),
  );

const noopResultHandler = (op: TestOp): Effect.Effect<OperationResult> =>
  Effect.succeed({ result: "no-op", message: `Already installed ${op.args.label}` });

const readyReadiness: Readiness = { status: "ready", message: Option.none() };

const makeStep = (
  label: string,
  readiness: Readiness = readyReadiness,
): PlannedJobStep<TestOp> => ({
  _tag: "PlannedJobStep",
  operation: makeOp(label),
  readiness,
  label,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("applyPlan", () => {
  it.effect("dispatches steps with ready readiness to handler by name", () =>
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
        result: { result: "success", message: "Installed commit" },
      });
      expect(steps[1]).toMatchObject({
        _tag: "JobStepResult",
        result: { result: "success", message: "Installed review-pr" },
      });
    }),
  );

  it.effect("promotes steps with skip readiness as no-op without dispatch", () =>
    Effect.gen(function* () {
      const applied = yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                makeStep("commit"),
                makeStep("review-pr", { status: "skip", message: "already installed" }),
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
        result: { result: "success", message: "Installed commit" },
      });
      expect(steps[1]).toMatchObject({
        _tag: "JobStepResult",
        result: { result: "no-op", message: "already installed" },
      });
    }),
  );

  it.effect("returns no-op results when all steps have skip readiness", () =>
    Effect.gen(function* () {
      const applied = yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                makeStep("commit", { status: "skip", message: "already installed" }),
                makeStep("review-pr", { status: "skip", message: "already installed" }),
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
          (s) => s._tag === "JobStepResult" && "result" in s && s.result.result === "no-op",
        ),
      ).toBe(true);
    }),
  );

  it.effect("promotes steps with error readiness as error without dispatch", () =>
    Effect.gen(function* () {
      const applied = yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: 1,
              steps: [
                makeStep("blocked", {
                  status: "error",
                  message: "depends on pack @org/pack",
                }),
              ],
            },
          ],
        }),
        { "test-op": successHandler },
      );

      const steps = applied.jobs.flatMap((j) => j.steps);
      expect(steps).toHaveLength(1);
      expect(steps[0]).toMatchObject({
        _tag: "JobStepResult",
        result: { result: "error", message: "depends on pack @org/pack" },
      });
    }),
  );

  it.effect("dispatches steps with warn readiness to handler", () =>
    Effect.gen(function* () {
      const applied = yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: 1,
              steps: [makeStep("cautious", { status: "warn", message: "may conflict" })],
            },
          ],
        }),
        { "test-op": successHandler },
      );

      const steps = applied.jobs.flatMap((j) => j.steps);
      expect(steps).toHaveLength(1);
      expect(steps[0]).toMatchObject({
        _tag: "JobStepResult",
        result: { result: "success", message: "Installed cautious" },
      });
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
        result: { result: "success", message: "Installed commit" },
      });
      expect(steps[1]).toMatchObject({
        _tag: "JobStepResult",
        result: { result: "success", message: "Installed review-pr" },
      });
    }),
  );

  it.effect("blocks later jobs after earlier reconciliation error", () =>
    Effect.gen(function* () {
      type MixedOp =
        | Operation<"read-recover-lockfile", { label: string }>
        | Operation<"install-command", { label: string }>;
      const called: string[] = [];

      const failingRecover = (_op: Extract<MixedOp, { name: "read-recover-lockfile" }>) =>
        Effect.fail(makeCliError({ code: "RECONCILE_FAILED", what: "source unreachable" }));
      const installCommand = (op: Extract<MixedOp, { name: "install-command" }>) =>
        Effect.sync(() => {
          called.push(op.args.label);
          return { result: "success" as const, message: `Installed ${op.args.label}` };
        });

      const plan: Plan<MixedOp> = {
        name: "gating",
        description: Option.none(),
        jobs: [
          {
            concurrency: 1,
            steps: [
              {
                _tag: "PlannedJobStep",
                operation: { name: "read-recover-lockfile", args: { label: "recover" } },
                readiness: { status: "ready", message: Option.none() },
                label: "recover",
              },
            ],
          },
          {
            concurrency: 1,
            steps: [
              {
                _tag: "PlannedJobStep",
                operation: { name: "install-command", args: { label: "cmd" } },
                readiness: { status: "ready", message: Option.none() },
                label: "cmd",
              },
            ],
          },
        ],
      };

      const applied = yield* applyPlan(plan, {
        "read-recover-lockfile": failingRecover as unknown as (
          op: MixedOp,
        ) => Effect.Effect<OperationResult, CliError>,
        "install-command": installCommand as unknown as (
          op: MixedOp,
        ) => Effect.Effect<OperationResult, CliError>,
      });

      expect(called).toEqual([]);
      expect(applied.jobs[1]?.steps[0]).toMatchObject({
        _tag: "JobStepResult",
        result: {
          result: "no-op",
          message: "blocked by earlier reconciliation failure",
        },
      });
    }),
  );

  it.effect("catches CliError and converts to error result", () =>
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
        result: { result: "error", message: "Failed to install bad (TEST_OP_FAILED)" },
      });
    }),
  );

  it.effect("includes CliError details in error result message", () =>
    Effect.gen(function* () {
      const errorWithDetailsHandler = (_op: TestOp): Effect.Effect<OperationResult, CliError> =>
        Effect.fail(
          makeCliError({
            code: "TEST_OP_FAILED",
            what: "Failed to install detail-skill",
            details: ["Directory is not writable", "Path: /tmp/skills"],
          }),
        );

      const applied = yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: 1,
              steps: [makeStep("detail-skill")],
            },
          ],
        }),
        { "test-op": errorWithDetailsHandler },
      );

      const steps = applied.jobs.flatMap((j) => j.steps);
      expect(steps).toHaveLength(1);
      expect(steps[0]).toMatchObject({
        _tag: "JobStepResult",
        result: {
          result: "error",
          message:
            "Failed to install detail-skill (TEST_OP_FAILED) | Directory is not writable | Path: /tmp/skills",
        },
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
        result: { result: "no-op", message: "Already installed skip" },
      });
    }),
  );

  it.effect("returns empty plan for empty plan", () =>
    Effect.gen(function* () {
      const applied = yield* applyPlan(makePlan({ jobs: [] }), { "test-op": successHandler });

      expect(applied.jobs).toEqual([]);
    }),
  );

  it.effect("returns error when registered operation has no provided handler", () =>
    Effect.gen(function* () {
      type RegisteredOp = Operation<"install-skill", Record<string, never>>;
      const plan: Plan<RegisteredOp> = {
        name: "Missing handler plan",
        description: Option.none(),
        jobs: [
          {
            concurrency: 1,
            steps: [
              {
                _tag: "PlannedJobStep",
                operation: { name: "install-skill", args: {} },
                readiness: { status: "ready", message: Option.none() },
                label: "install",
              },
            ],
          },
        ],
      };

      const applied = yield* applyPlan(
        plan,
        {} as unknown as {
          "install-skill": (op: RegisteredOp) => Effect.Effect<OperationResult, CliError>;
        },
      );

      const steps = applied.jobs.flatMap((j) => j.steps);
      expect(steps).toHaveLength(1);
      expect(steps[0]).toMatchObject({
        _tag: "JobStepResult",
        result: {
          result: "error",
          message: "No handler provided for operation: install-skill (PLAN_STEP_HANDLER_MISSING)",
        },
      });
    }),
  );
});

describe("CliError in applyPlan", () => {
  it("constructs with code, what, and cause", () => {
    const error = makeCliError({
      code: "INSTALL_OPERATION_FAILED",
      what: "Path traversal detected",
    });

    expect(error._tag).toBe("CliError");
    expect(error.code).toBe("INSTALL_OPERATION_FAILED");
    expect(error.what).toBe("Path traversal detected");
  });

  it("preserves original cause", () => {
    const originalError = new Error("EACCES");
    const error = makeCliError({
      code: "INSTALL_OPERATION_FAILED",
      what: "Copy failed",
      cause: originalError,
    });

    expect(error.cause).toBe(originalError);
  });
});

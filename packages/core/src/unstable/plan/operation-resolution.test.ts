import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { makeAppError } from "../app-error/index.js";
import { applyPlan } from "./apply-plan.js";
import {
  countUnitStates,
  deriveOperationOutcome,
  executedUnits,
  makeOperationResolution,
  operationExitCode,
  operationOk,
  plannedUnits,
  unitsByStableIdentity,
  type OperationResolution,
  type ResolvedUnit,
} from "./operation-resolution.js";
import type { Job, Plan } from "./plan.js";

const unit = (
  id: string,
  state: ResolvedUnit["state"],
  over?: Partial<ResolvedUnit>,
): ResolvedUnit =>
  ({
    id,
    label: id,
    state,
    ...over,
  }) satisfies ResolvedUnit;

const resolution = (
  over: Partial<Parameters<typeof makeOperationResolution>[0]> & {
    readonly units?: ReadonlyArray<ResolvedUnit>;
  },
): OperationResolution =>
  makeOperationResolution({
    name: "Update skills",
    description: Option.none(),
    mode: "apply",
    atomicity: { declared: "candidate-atomic", applied: "candidate-atomic" },
    units: [],
    ...over,
  });

describe("deriveOperationOutcome", () => {
  it("C-13: a fully unchanged multiset derives no-op — never applied", () => {
    const value = resolution({ units: [unit("a", "unchanged"), unit("b", "unchanged")] });
    expect(deriveOperationOutcome(value)).toBe("no-op");
    expect(operationExitCode(value)).toBe(0);
  });

  it("C-13: skipped work is zero state-changing effects and derives no-op", () => {
    const value = resolution({ units: [unit("a", "unchanged"), unit("b", "skipped")] });
    expect(deriveOperationOutcome(value)).toBe("no-op");
  });

  it("C-12: applied requires a committed effect and no attempted failure", () => {
    const value = resolution({ units: [unit("a", "committed"), unit("b", "unchanged")] });
    expect(deriveOperationOutcome(value)).toBe("applied");
    expect(operationExitCode(value)).toBe(0);
  });

  it("C-14: surviving commits plus failures derive partial on exit 1", () => {
    const value = resolution({ units: [unit("a", "committed"), unit("b", "failed")] });
    expect(deriveOperationOutcome(value)).toBe("partial");
    expect(operationExitCode(value)).toBe(1);
  });

  it("C-14: surviving commits plus blocked units derive partial", () => {
    const value = resolution({
      units: [
        unit("a", "committed"),
        unit("b", "blocked", {
          blocking: {
            class: "operation-aborted",
            subject: "b",
            phase: "apply",
            detail: "blocked by earlier step failure",
            reference: "a",
          },
        }),
      ],
    });
    expect(deriveOperationOutcome(value)).toBe("partial");
  });

  it("C-12: no surviving commits derives failed", () => {
    const value = resolution({
      units: [unit("a", "failed")],
      failure: makeAppError({ code: "conflict", detail: "integrity mismatch" }),
    });
    expect(deriveOperationOutcome(value)).toBe("failed");
  });

  it("C-06: restored work derives failed with its rollback report, never partial", () => {
    const value = resolution({
      units: [
        unit("a", "rolled-back", { disposition: "restored" }),
        unit("b", "failed", { disposition: "untouched" }),
      ],
      failure: makeAppError({ code: "validation", detail: "write failed" }),
    });
    expect(deriveOperationOutcome(value)).toBe("failed");
  });

  it("C-12: a typed blocking condition derives blocked — never failed", () => {
    const value = resolution({
      blocking: {
        class: "precondition-unmet",
        subject: "Update skills",
        phase: "planning",
        detail: "a precondition is unmet",
        causeCode: "conflict",
      },
      units: [unit("a", "ready")],
    });
    expect(deriveOperationOutcome(value)).toBe("blocked");
  });

  it("C-16: a declined confirmation derives cancelled at exit 0", () => {
    const value = resolution({ declined: true, units: [unit("a", "ready")] });
    expect(deriveOperationOutcome(value)).toBe("cancelled");
    expect(operationExitCode(value)).toBe(0);
  });

  it("C-15: an external termination derives interrupted regardless of unit states", () => {
    const value = resolution({
      units: [unit("a", "committed"), unit("b", "failed")],
      interruption: { signal: "SIGINT", disposition: "retained" },
    });
    expect(deriveOperationOutcome(value)).toBe("interrupted");
  });

  it("C-07: recovery that blocks normal operation derives recovery-required at exit 6", () => {
    const value = resolution({
      units: [unit("a", "failed", { disposition: "retained" })],
      recovery: {
        blocksNormalOperation: true,
        retained: [".axm/extensions/@test/skills/a"],
        actions: [{ description: "Re-run the update to resolve retained state." }],
      },
    });
    expect(deriveOperationOutcome(value)).toBe("recovery-required");
    expect(operationExitCode(value)).toBe(6);
  });

  it("C-07: recovery content accompanying survivable state stays partial", () => {
    const value = resolution({
      units: [unit("a", "committed"), unit("b", "failed")],
      recovery: {
        blocksNormalOperation: false,
        retained: [],
        actions: [],
      },
    });
    expect(deriveOperationOutcome(value)).toBe("partial");
  });

  it("previewed: preview mode derives previewed at exit 0", () => {
    const value = resolution({ mode: "preview", units: [unit("a", "ready")] });
    expect(deriveOperationOutcome(value)).toBe("previewed");
    expect(operationExitCode(value)).toBe(0);
  });

  it("a flag-requested divergence on a preview exits 1 with ok:false", () => {
    const value = resolution({ mode: "preview", divergence: true, units: [unit("a", "ready")] });
    expect(deriveOperationOutcome(value)).toBe("previewed");
    expect(operationExitCode(value)).toBe(1);
    expect(operationOk(value)).toBe(false);
  });

  it("an operation-level failure with no terminal units derives failed, not no-op", () => {
    const value = resolution({
      units: [unit("a", "ready")],
      failure: makeAppError({ code: "internal", detail: "restoration failed" }),
    });
    expect(deriveOperationOutcome(value)).toBe("failed");
  });
});

describe("operationExitCode", () => {
  const blocked = (
    blockingClass: NonNullable<OperationResolution["blocking"]>["class"],
    causeCode?: NonNullable<OperationResolution["blocking"]>["causeCode"],
  ) =>
    resolution({
      blocking: {
        class: blockingClass,
        subject: "s",
        phase: "planning",
        detail: "d",
        ...(causeCode === undefined ? {} : { causeCode }),
      },
    });

  it("C-19: approval-required and override-required exit 2", () => {
    expect(operationExitCode(blocked("approval-required"))).toBe(2);
    expect(operationExitCode(blocked("override-required"))).toBe(2);
  });

  it("C-02, C-19: stale-candidate exits 6 on every path", () => {
    expect(operationExitCode(blocked("stale-candidate"))).toBe(6);
  });

  it("C-20: resource-conflict exits 6", () => {
    expect(operationExitCode(blocked("resource-conflict"))).toBe(6);
  });

  it("C-19: policy-excluded and dependency-cycle exit 6", () => {
    expect(operationExitCode(blocked("policy-excluded"))).toBe(6);
    expect(operationExitCode(blocked("dependency-cycle"))).toBe(6);
  });

  it("C-19: precondition-unmet exits by its cause class", () => {
    expect(operationExitCode(blocked("precondition-unmet", "conflict"))).toBe(6);
    expect(operationExitCode(blocked("precondition-unmet", "auth_required"))).toBe(13);
    expect(operationExitCode(blocked("precondition-unmet"))).toBe(1);
  });

  it("C-37: failed exits by cause class, defaulting to 1", () => {
    expect(
      operationExitCode(
        resolution({
          units: [unit("a", "failed")],
          failure: makeAppError({ code: "validation", detail: "d" }),
        }),
      ),
    ).toBe(9);
    expect(operationExitCode(resolution({ units: [unit("a", "failed")] }))).toBe(1);
  });

  it("C-15: interruption exits 130 for SIGINT and 143 for SIGTERM", () => {
    expect(
      operationExitCode(
        resolution({ interruption: { signal: "SIGINT", disposition: "restored" } }),
      ),
    ).toBe(130);
    expect(
      operationExitCode(
        resolution({ interruption: { signal: "SIGTERM", disposition: "restored" } }),
      ),
    ).toBe(143);
  });

  it("C-38: ok is true exactly when the exit is 0", () => {
    const zero = resolution({ units: [unit("a", "unchanged")] });
    expect(operationOk(zero)).toBe(true);
    const one = resolution({ units: [unit("a", "committed"), unit("b", "failed")] });
    expect(operationOk(one)).toBe(false);
    const cancelled = resolution({ declined: true });
    expect(operationOk(cancelled)).toBe(true);
  });
});

describe("countUnitStates", () => {
  it("C-08: the state buckets partition the unit set and sum to total", () => {
    const counts = countUnitStates([
      unit("a", "committed"),
      unit("b", "unchanged"),
      unit("c", "failed"),
      unit("d", "blocked"),
      unit("e", "skipped"),
      unit("f", "rolled-back"),
      unit("g", "ready"),
    ]);
    expect(
      counts.planned +
        counts.ready +
        counts.committed +
        counts.unchanged +
        counts.failed +
        counts.rolledBack +
        counts.blocked +
        counts.skipped +
        counts.cancelled,
    ).toBe(counts.total);
    expect(counts.total).toBe(7);
  });

  it("C-11: warnings are counted as annotations and never change a state bucket", () => {
    const counts = countUnitStates([
      unit("a", "committed", { warnings: ["publisher identity changed"] }),
    ]);
    expect(counts.committed).toBe(1);
    expect(counts.warnings).toBe(1);
  });
});

describe("unitsByStableIdentity", () => {
  it("C-30: document ordering follows stable identity, not completion timing", () => {
    const ordered = unitsByStableIdentity([
      unit("b", "committed"),
      unit("a", "committed"),
      unit("c", "unchanged"),
    ]);
    expect(ordered.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });
});

describe("plannedUnits", () => {
  it("C-11: a warn step is a ready unit with a warning annotation, not a state", () => {
    const jobs: ReadonlyArray<Job<never, never>> = [
      {
        concurrency: 1,
        steps: [
          {
            readiness: "warn",
            label: "a",
            warnMessage: "held back",
            run: Effect.succeed({ result: "success", message: "" }),
          },
        ],
      },
    ];
    const units = plannedUnits(jobs);
    expect(units[0]?.state).toBe("ready");
    expect(units[0]?.warnings).toEqual(["held back"]);
  });

  it("C-10: a readiness-error step is a blocked unit with a typed reason", () => {
    const jobs: ReadonlyArray<Job<never, never>> = [
      {
        concurrency: 1,
        steps: [
          {
            readiness: "error",
            label: "a",
            errorMessage: "conflicting configuration",
            blockingConditionIds: ["cond-1"],
          },
        ],
      },
    ];
    const units = plannedUnits(jobs);
    expect(units[0]?.state).toBe("blocked");
    expect(units[0]?.blocking?.class).toBe("precondition-unmet");
    expect(units[0]?.blocking?.reference).toBe("cond-1");
  });
});

describe("executedUnits", () => {
  it.effect(
    "C-10: a unit prevented by a sibling failure resolves blocked with a machine-readable reference",
    () =>
      Effect.gen(function* () {
        const plan: Plan<never, never> = {
          _tag: "Plan",
          name: "Update skills",
          description: Option.none(),
          jobs: [
            {
              concurrency: 1,
              steps: [
                {
                  readiness: "ready",
                  label: "a",
                  run: Effect.succeed({
                    result: "error",
                    message: "integrity mismatch",
                    error: makeAppError({ code: "conflict", detail: "integrity mismatch" }),
                  }),
                },
                {
                  readiness: "ready",
                  label: "b",
                  run: Effect.succeed({ result: "success", message: "updated" }),
                },
              ],
            },
          ],
        };
        const executed = yield* applyPlan(plan);
        const units = executedUnits(executed);
        expect(units[0]?.state).toBe("failed");
        expect(units[1]?.state).toBe("blocked");
        expect(units[1]?.blocking?.class).toBe("operation-aborted");
        expect(units[1]?.blocking?.reference).toBe("a");
      }),
  );

  it.effect("J-UPD-01: best-effort siblings terminate in states of their own", () =>
    Effect.gen(function* () {
      const plan: Plan<never, never> = {
        _tag: "Plan",
        name: "Update skills",
        description: Option.none(),
        executionCapabilities: { rollback: "non-rollbackable" },
        jobs: [
          {
            concurrency: 1,
            executionPolicy: "best-effort",
            steps: [
              {
                readiness: "ready",
                label: "a",
                run: Effect.succeed({
                  result: "error",
                  message: "integrity mismatch for a",
                  error: makeAppError({ code: "conflict", detail: "integrity mismatch for a" }),
                }),
              },
              {
                readiness: "ready",
                label: "b",
                run: Effect.succeed({
                  result: "success",
                  message: "updated",
                  artifact: { path: "b", scope: "project", change: "updated" },
                }),
              },
            ],
          },
        ],
      };
      const executed = yield* applyPlan(plan);
      const units = executedUnits(executed);
      expect(units.map((entry) => entry.state)).toEqual(["failed", "committed"]);
    }),
  );

  it("C-13: an unchanged artifact resolves unchanged; skipped work resolves skipped", () => {
    const units = executedUnits({
      _tag: "ExecutedPlan",
      name: "Update skills",
      description: Option.none(),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              label: "a",
              result: {
                result: "success",
                message: "already up to date",
                artifact: { path: "a", scope: "project", change: "unchanged" },
              },
            },
            {
              label: "b",
              result: {
                result: "success",
                disposition: "skipped",
                message: "Skipping b: disabled",
              },
            },
          ],
        },
      ],
    });
    expect(units.map((entry) => entry.state)).toEqual(["unchanged", "skipped"]);
  });

  it("C-06: a restored execution reports rolled-back and restored dispositions", () => {
    const units = executedUnits(
      {
        _tag: "ExecutedPlan",
        name: "Update skills",
        description: Option.none(),
        jobs: [
          {
            concurrency: 1,
            steps: [
              {
                label: "a",
                result: {
                  result: "success",
                  message: "updated",
                  artifact: { path: "a", scope: "project", change: "updated" },
                },
              },
              {
                label: "b",
                result: {
                  result: "error",
                  message: "write failed",
                  error: makeAppError({ code: "validation", detail: "write failed" }),
                },
              },
            ],
          },
        ],
      },
      { restored: true },
    );
    expect(units[0]?.state).toBe("rolled-back");
    expect(units[0]?.disposition).toBe("restored");
    // The failed unit's in-flight effects were undone with the candidate.
    expect(units[1]?.state).toBe("failed");
    expect(units[1]?.disposition).toBe("restored");
  });
});

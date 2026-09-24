import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";

import { StepFailure, deriveOperationOutcome } from "@agentxm/workspace/transitions/planning";
import {
  makeOperationResolution,
  type OperationResolution,
  type ResolvedUnit,
} from "@agentxm/workspace/transitions/planning";
import { operationOk, resolutionExitCode } from "./operation-exit-code.js";

const ok = (value: OperationResolution): boolean =>
  operationOk(value, deriveOperationOutcome(value));

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
    atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
    units: [],
    ...over,
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

  it("C-13: a no-op resolution exits 0", () => {
    expect(resolutionExitCode(resolution({ units: [unit("a", "unchanged")] }))).toBe(0);
  });

  it("C-15: an interrupted resolution exits with the signal's code", () => {
    expect(
      resolutionExitCode(
        resolution({
          units: [unit("a", "committed", { disposition: "retained" })],
          interruption: { signal: "SIGINT", disposition: "retained" },
        }),
      ),
    ).toBe(130);
    expect(
      resolutionExitCode(
        resolution({
          units: [unit("a", "committed", { disposition: "retained" })],
          interruption: { signal: "SIGTERM", disposition: "retained" },
        }),
      ),
    ).toBe(143);
  });

  it("C-12: an applied resolution exits 0", () => {
    expect(
      resolutionExitCode(resolution({ units: [unit("a", "committed"), unit("b", "unchanged")] })),
    ).toBe(0);
  });

  it("C-14: a partial resolution exits 1", () => {
    expect(
      resolutionExitCode(resolution({ units: [unit("a", "committed"), unit("b", "failed")] })),
    ).toBe(1);
  });

  it("C-16: a declined confirmation exits 0", () => {
    expect(resolutionExitCode(resolution({ declined: true, units: [unit("a", "ready")] }))).toBe(0);
  });

  it("previewed: a preview exits 0, an empty preview exits 0", () => {
    expect(resolutionExitCode(resolution({ mode: "preview", units: [unit("a", "ready")] }))).toBe(
      0,
    );
    expect(resolutionExitCode(resolution({ mode: "preview", units: [] }))).toBe(0);
  });

  it("a flag-requested divergence on a preview exits 1 with ok:false", () => {
    const value = resolution({ mode: "preview", divergence: true, units: [unit("a", "ready")] });
    expect(resolutionExitCode(value)).toBe(1);
    expect(ok(value)).toBe(false);
  });

  it("C-07: a retained failure never exits 0", () => {
    const value = resolution({
      units: [unit("a", "failed", { disposition: "retained" })],
      failure: new StepFailure({ category: "internal", detail: "restoration failed" }),
    });
    expect(resolutionExitCode(value)).not.toBe(0);
  });

  it("C-19: approval-required and override-required exit 2", () => {
    expect(resolutionExitCode(blocked("approval-required"))).toBe(2);
    expect(resolutionExitCode(blocked("override-required"))).toBe(2);
  });

  it("C-02, C-19: stale-candidate exits 6 on every path", () => {
    expect(resolutionExitCode(blocked("stale-candidate"))).toBe(6);
  });

  it("C-20: resource-conflict exits 6", () => {
    expect(resolutionExitCode(blocked("resource-conflict"))).toBe(6);
  });

  it("C-19: policy-excluded and dependency-cycle exit 6", () => {
    expect(resolutionExitCode(blocked("policy-excluded"))).toBe(6);
    expect(resolutionExitCode(blocked("dependency-cycle"))).toBe(6);
  });

  it("C-19: precondition-unmet exits by its cause class", () => {
    expect(resolutionExitCode(blocked("precondition-unmet", "conflict"))).toBe(6);
    expect(resolutionExitCode(blocked("precondition-unmet", "auth_required"))).toBe(13);
    expect(resolutionExitCode(blocked("precondition-unmet"))).toBe(1);
  });

  it("C-37: failed exits by cause class, defaulting to 1", () => {
    expect(
      resolutionExitCode(
        resolution({
          units: [unit("a", "failed")],
          failure: new StepFailure({ category: "validation", detail: "d" }),
        }),
      ),
    ).toBe(9);
    expect(resolutionExitCode(resolution({ units: [unit("a", "failed")] }))).toBe(1);
  });

  it("C-15: interruption exits 130 for SIGINT and 143 for SIGTERM", () => {
    expect(
      resolutionExitCode(
        resolution({ interruption: { signal: "SIGINT", disposition: "restored" } }),
      ),
    ).toBe(130);
    expect(
      resolutionExitCode(
        resolution({ interruption: { signal: "SIGTERM", disposition: "restored" } }),
      ),
    ).toBe(143);
  });

  it("C-38: ok is true exactly when the exit is 0", () => {
    const zero = resolution({ units: [unit("a", "unchanged")] });
    expect(ok(zero)).toBe(true);
    const one = resolution({ units: [unit("a", "committed"), unit("b", "failed")] });
    expect(ok(one)).toBe(false);
    const cancelled = resolution({ declined: true });
    expect(ok(cancelled)).toBe(true);
  });
});

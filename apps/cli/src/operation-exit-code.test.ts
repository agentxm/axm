import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";

import { StepFailure } from "@agentxm/workspace-operations";
import {
  makeOperationResolution,
  type OperationResolution,
  type ResolvedUnit,
} from "@agentxm/workspace-operations";
import { operationExitCode, operationOk } from "./operation-exit-code.js";

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
    expect(operationExitCode(resolution({ units: [unit("a", "unchanged")] }))).toBe(0);
  });

  it("C-12: an applied resolution exits 0", () => {
    expect(
      operationExitCode(resolution({ units: [unit("a", "committed"), unit("b", "unchanged")] })),
    ).toBe(0);
  });

  it("C-14: a partial resolution exits 1", () => {
    expect(
      operationExitCode(resolution({ units: [unit("a", "committed"), unit("b", "failed")] })),
    ).toBe(1);
  });

  it("C-16: a declined confirmation exits 0", () => {
    expect(operationExitCode(resolution({ declined: true, units: [unit("a", "ready")] }))).toBe(0);
  });

  it("previewed: a preview exits 0, an empty preview exits 0", () => {
    expect(operationExitCode(resolution({ mode: "preview", units: [unit("a", "ready")] }))).toBe(0);
    expect(operationExitCode(resolution({ mode: "preview", units: [] }))).toBe(0);
  });

  it("a flag-requested divergence on a preview exits 1 with ok:false", () => {
    const value = resolution({ mode: "preview", divergence: true, units: [unit("a", "ready")] });
    expect(operationExitCode(value)).toBe(1);
    expect(operationOk(value)).toBe(false);
  });

  it("C-07: a retained failure never exits 0", () => {
    const value = resolution({
      units: [unit("a", "failed", { disposition: "retained" })],
      failure: new StepFailure({ category: "internal", detail: "restoration failed" }),
    });
    expect(operationExitCode(value)).not.toBe(0);
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
          failure: new StepFailure({ category: "validation", detail: "d" }),
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

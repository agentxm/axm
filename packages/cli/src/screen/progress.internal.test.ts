import { describe, expect, it } from "vitest";

import type { OperationEvent } from "@agentxm/workspace-operations";

import {
  initialProgress,
  operationElapsedMs,
  plannedProgress,
  reduceProgress,
  runningTasks,
  type ProgressState,
} from "./progress.js";

/** A recorded install log: resolution, planning, apply with a download, a wait, settlement. */
export const recordedInstallLog: ReadonlyArray<OperationEvent> = [
  {
    _tag: "OperationStarted",
    seq: 1,
    atMs: 1_000,
    operationId: "operation-1",
    name: "Install skill",
    mode: "apply",
  },
  { _tag: "PhaseStarted", seq: 2, atMs: 1_001, phase: "resolution" },
  {
    _tag: "UnitStarted",
    seq: 3,
    atMs: 1_002,
    unitId: "extension-sources",
    label: "extension sources",
    index: 0,
  },
  {
    _tag: "UnitResolved",
    seq: 4,
    atMs: 1_200,
    unitId: "extension-sources",
    label: "extension sources",
    state: "committed",
    index: 0,
  },
  { _tag: "PhaseStarted", seq: 5, atMs: 1_201, phase: "planning" },
  {
    _tag: "UnitStarted",
    seq: 6,
    atMs: 1_202,
    unitId: "lockfile-reconciliation",
    label: "lockfile reconciliation",
    index: 1,
  },
  {
    _tag: "UnitResolved",
    seq: 7,
    atMs: 1_250,
    unitId: "lockfile-reconciliation",
    label: "lockfile reconciliation",
    state: "committed",
    index: 1,
  },
  { _tag: "PhaseStarted", seq: 8, atMs: 1_251, phase: "validation" },
  {
    _tag: "Waiting",
    seq: 9,
    atMs: 1_252,
    blockingClass: "resource-conflict",
    subject: "workspace-transition",
    detail: "axm sync (pid 41)",
  },
  { _tag: "WaitEnded", seq: 10, atMs: 1_900, subject: "workspace-transition" },
  { _tag: "PhaseStarted", seq: 11, atMs: 1_901, phase: "apply" },
  {
    _tag: "UnitStarted",
    seq: 12,
    atMs: 1_902,
    unitId: "skill:code-review",
    label: "code-review",
    index: 0,
    total: 2,
  },
  {
    _tag: "UnitProgress",
    seq: 13,
    atMs: 2_000,
    unitId: "skill:code-review",
    done: 512_000,
    total: 2_048_000,
    unit: "bytes",
  },
  {
    _tag: "UnitProgress",
    seq: 14,
    atMs: 2_100,
    unitId: "skill:code-review",
    done: 2_048_000,
    total: 2_048_000,
    unit: "bytes",
  },
  {
    _tag: "UnitResolved",
    seq: 15,
    atMs: 2_150,
    unitId: "skill:code-review",
    label: "code-review",
    state: "committed",
    index: 0,
    total: 2,
  },
  {
    _tag: "UnitStarted",
    seq: 16,
    atMs: 2_151,
    unitId: "skill:deploy",
    label: "deploy",
    index: 1,
    total: 2,
  },
  {
    _tag: "UnitResolved",
    seq: 17,
    atMs: 2_400,
    unitId: "skill:deploy",
    label: "deploy",
    state: "failed",
    index: 1,
    total: 2,
  },
  { _tag: "PhaseStarted", seq: 18, atMs: 2_401, phase: "restoration" },
  { _tag: "OperationSettled", seq: 19, atMs: 2_500, outcome: "failed" },
];

const fold = (events: ReadonlyArray<OperationEvent>): ProgressState =>
  events.reduce(reduceProgress, initialProgress);

describe("reduceProgress", () => {
  it("is a deterministic fold over a recorded log", () => {
    const once = fold(recordedInstallLog);
    const twice = fold(recordedInstallLog);
    expect(twice).toEqual(once);
    expect(once.lastSeq).toBe(19);
    expect(once.operation).toEqual({
      id: "operation-1",
      name: "Install skill",
      mode: "apply",
      startedAtMs: 1_000,
    });
    expect(once.phase).toBe("restoration");
    expect(once.settled).toEqual({ outcome: "failed", atMs: 2_500 });
    expect(once.waiting).toEqual([]);
    expect(once.tasks.map((task) => [task.id, task.status])).toEqual([
      ["extension-sources", "committed"],
      ["lockfile-reconciliation", "committed"],
      ["skill:code-review", "committed"],
      ["skill:deploy", "failed"],
    ]);
    expect(once.tasks[2]?.measure).toEqual({ done: 2_048_000, total: 2_048_000, unit: "bytes" });
    expect(operationElapsedMs(once)).toBe(1_500);
  });

  it("tracks running units, open waits, and planned counts mid-flight", () => {
    const midApply = fold(recordedInstallLog.slice(0, 13));
    expect(runningTasks(midApply).map((task) => task.id)).toEqual(["skill:code-review"]);
    expect(plannedProgress(midApply)).toEqual({ settled: 0, total: 2 });
    expect(midApply.phase).toBe("apply");
    expect(operationElapsedMs(midApply, 2_000)).toBe(1_000);

    const waiting = fold(recordedInstallLog.slice(0, 9));
    expect(waiting.waiting).toEqual([
      {
        blockingClass: "resource-conflict",
        subject: "workspace-transition",
        detail: "axm sync (pid 41)",
        sinceMs: 1_252,
      },
    ]);
    expect(plannedProgress(waiting)).toBeUndefined();
  });

  it("admits a resolution for a unit whose start was not observed", () => {
    const state = reduceProgress(initialProgress, {
      _tag: "UnitResolved",
      seq: 4,
      atMs: 10,
      unitId: "late",
      label: "late unit",
      state: "unchanged",
      index: 0,
    });
    expect(state.tasks).toEqual([
      {
        id: "late",
        label: "late unit",
        index: 0,
        status: "unchanged",
        startedAtMs: 10,
        settledAtMs: 10,
      },
    ]);
  });
});

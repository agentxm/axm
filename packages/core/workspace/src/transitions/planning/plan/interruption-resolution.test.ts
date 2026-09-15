/**
 * The terminal resolution an interrupted operation reports.
 *
 * These cases fix the durable-state story a person reads after pressing
 * Ctrl-C: what settled stays settled, what was in flight is named, and what
 * was never attempted is not confused with either.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";

import { deriveOperationOutcome } from "./operation-resolution.js";
import { resolveInterruption } from "./interruption-resolution.js";

describe("resolveInterruption", () => {
  it("C-15: pre-journal interruption reports the requested mode truthfully", () => {
    const preview = resolveInterruption(
      { replayCommand: "axm update", mode: "preview", planName: "Update extensions" },
      Option.none(),
      "SIGINT",
      [],
    );
    expect(preview.mode).toBe("preview");
    expect(preview.atomicity).toEqual({
      declared: "closure-atomic",
      applied: "closure-atomic",
    });
    expect(preview.interruption).toEqual({ signal: "SIGINT", disposition: "none" });
    expect(preview.units).toEqual([]);
    expect(deriveOperationOutcome(preview)).toBe("interrupted");

    const apply = resolveInterruption(
      { replayCommand: "axm update", mode: "apply", planName: "Update extensions" },
      Option.none(),
      "SIGTERM",
      [],
    );
    expect(apply.mode).toBe("apply");
    expect(deriveOperationOutcome(apply)).toBe("interrupted");
  });

  it("C-15: pre-journal interruption keeps the declared non-rollbackable atomicity", () => {
    const resolution = resolveInterruption(
      {
        replayCommand: "axm update",
        mode: "apply",
        planName: "Update workspace extensions",
        declaredAtomicity: "non-rollbackable",
      },
      Option.none(),
      "SIGINT",
      [],
    );
    // Nothing was attempted, so no durable effect was made or retained: the
    // declared class is the family's, the applied class reflects zero effects.
    expect(resolution.atomicity).toEqual({
      declared: "non-rollbackable",
      applied: "closure-atomic",
    });
    expect(resolution.interruption?.disposition).toBe("none");
  });

  // The journal records per-unit started and resolved facts. A unit whose run
  // began but whose settlement was not observed is in flight at the stopping
  // point: for a non-rollbackable family its durable effects are unknown —
  // never "not attempted".
  it("C-15: a started unit is never reported as not attempted", () => {
    const resolution = resolveInterruption(
      { replayCommand: "axm sync", mode: "apply", planName: "Sync workspace" },
      Option.some({
        name: "Sync workspace",
        description: Option.none(),
        mode: "apply" as const,
        candidateId: "candidate-1",
        atomicity: { declared: "non-rollbackable" as const, applied: "non-rollbackable" as const },
        plannedUnits: [
          { id: "skill:one", label: "one", state: "ready" as const },
          { id: "skill:two", label: "two", state: "ready" as const },
          { id: "skill:three", label: "three", state: "ready" as const },
        ],
        phase: "apply" as const,
        startedUnitIds: ["skill:one", "skill:two"],
        resolved: [
          {
            key: "skill:one",
            label: "one",
            result: {
              result: "success" as const,
              message: "installed",
              artifact: {
                path: ".claude/skills/one",
                scope: "project" as const,
                change: "created" as const,
              },
            },
          },
        ],
        restoresOnFailure: false,
      }),
      "SIGINT",
      [],
    );
    const one = resolution.units.find((unit) => unit.id === "skill:one");
    expect(one?.state).toBe("committed");
    expect(one?.disposition).toBe("retained");
    const two = resolution.units.find((unit) => unit.id === "skill:two");
    expect(two?.state).toBe("interrupted");
    expect(two?.disposition).toBe("unknown");
    expect(two?.message ?? "").not.toContain("not attempted");
    const three = resolution.units.find((unit) => unit.id === "skill:three");
    expect(three?.state).toBe("blocked");
    expect(three?.message).toContain("not attempted");
    expect(resolution.interruption).toEqual({ signal: "SIGINT", disposition: "unknown" });
    expect(resolution.atomicity.applied).toBe("non-rollbackable");
    expect(resolution.recovery?.retained).toEqual([".claude/skills/one"]);
    expect(deriveOperationOutcome(resolution)).toBe("interrupted");
  });

  it("C-15: an in-flight unit of a restoring apply reports restored effects", () => {
    const resolution = resolveInterruption(
      { replayCommand: "axm update", mode: "apply", planName: "Update extensions" },
      Option.some({
        name: "Update extensions",
        description: Option.none(),
        mode: "apply" as const,
        candidateId: "candidate-2",
        atomicity: { declared: "closure-atomic" as const, applied: "closure-atomic" as const },
        plannedUnits: [
          { id: "skill:one", label: "one", state: "ready" as const },
          { id: "skill:two", label: "two", state: "ready" as const },
        ],
        phase: "apply" as const,
        startedUnitIds: ["skill:one", "skill:two"],
        resolved: [
          {
            key: "skill:one",
            label: "one",
            result: { result: "success" as const, message: "updated" },
          },
        ],
        restoresOnFailure: true,
      }),
      "SIGTERM",
      [],
    );
    // The settled first closure stands — closures settle independently — and
    // only the in-flight closure's effects were restored.
    const one = resolution.units.find((unit) => unit.id === "skill:one");
    expect(one?.state).toBe("committed");
    expect(one?.disposition).toBe("retained");
    const two = resolution.units.find((unit) => unit.id === "skill:two");
    expect(two?.state).toBe("interrupted");
    expect(two?.disposition).toBe("restored");
    expect(resolution.interruption).toEqual({ signal: "SIGTERM", disposition: "retained" });
    expect(resolution.atomicity.applied).toBe("closure-atomic");
  });

  // Settlement recorded before the interruptible boundary means a commit that
  // finished just before the signal reports as committed — even though the
  // operation never reached its normal emit.
  it("C-15: interruption after local commit but before emit reports the commit", () => {
    const resolution = resolveInterruption(
      { replayCommand: "axm skills install", mode: "apply", planName: "Install skill" },
      Option.some({
        name: "Install skill",
        description: Option.none(),
        mode: "apply" as const,
        candidateId: "candidate-3",
        atomicity: { declared: "non-rollbackable" as const, applied: "non-rollbackable" as const },
        plannedUnits: [{ id: "skill:one", label: "one", state: "ready" as const }],
        phase: "apply" as const,
        startedUnitIds: ["skill:one"],
        resolved: [
          {
            key: "skill:one",
            label: "one",
            result: {
              result: "success" as const,
              message: "installed",
              artifact: {
                path: ".claude/skills/one",
                scope: "project" as const,
                change: "created" as const,
              },
            },
          },
        ],
        restoresOnFailure: false,
      }),
      "SIGINT",
      [],
    );
    const one = resolution.units.find((unit) => unit.id === "skill:one");
    expect(one?.state).toBe("committed");
    expect(one?.disposition).toBe("retained");
    expect(resolution.interruption).toEqual({ signal: "SIGINT", disposition: "retained" });
    expect(resolution.recovery?.retained).toEqual([".claude/skills/one"]);
  });

  // Before apply begins — planning, preview, confirmation, or validation —
  // nothing was attempted and the planned units stand as planned.
  it("C-15: interruption before apply reports planned units untouched", () => {
    const resolution = resolveInterruption(
      { replayCommand: "axm update", mode: "apply", planName: "Update extensions" },
      Option.some({
        name: "Update extensions",
        description: Option.none(),
        mode: "apply" as const,
        candidateId: "candidate-4",
        atomicity: { declared: "closure-atomic" as const, applied: "closure-atomic" as const },
        plannedUnits: [{ id: "skill:one", label: "one", state: "ready" as const }],
        phase: "validation" as const,
        startedUnitIds: [],
        resolved: [],
        restoresOnFailure: true,
      }),
      "SIGINT",
      [],
    );
    expect(resolution.units).toEqual([{ id: "skill:one", label: "one", state: "ready" }]);
    expect(resolution.interruption).toEqual({ signal: "SIGINT", disposition: "none" });
    expect(resolution.atomicity.applied).toBe("closure-atomic");
  });
});

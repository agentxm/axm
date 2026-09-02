import * as nodeFs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { TestFlagsLayer } from "../../cli-flags/index.js";
import { TestRenderer } from "../../cli-renderer/index.js";
import { deriveOperationOutcome } from "@agentxm/workspace-operations";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { isWorkspaceTransitionHeldByThisInvocation } from "@agentxm/workspace-operations";
import * as Option from "effect/Option";

import { makeBaseWorkspaceMock } from "../../test-stubs.js";
import { operationExitCode } from "../../operation-exit-code.js";
import { interruptionResolution, withOperationLifecycle } from "./operation-lifecycle.js";

let tempDir: string;

beforeEach(() => {
  tempDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-operation-lifecycle-"));
});

afterEach(() => {
  nodeFs.rmSync(tempDir, { recursive: true, force: true });
});

describe("withOperationLifecycle", () => {
  // A resolution produced before the journal exists reports what was
  // requested, never a hardcoded apply/closure-atomic claim: an interrupted
  // preview stays a preview, and a non-rollbackable family keeps its
  // declared atomicity.
  it("C-15: pre-journal interruption reports the requested mode truthfully", () => {
    const preview = interruptionResolution(
      { command: "update", mode: "preview", planName: "Update extensions" },
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
    expect(operationExitCode(preview)).toBe(130);

    const apply = interruptionResolution(
      { command: "update", mode: "apply", planName: "Update extensions" },
      Option.none(),
      "SIGTERM",
      [],
    );
    expect(apply.mode).toBe("apply");
    expect(deriveOperationOutcome(apply)).toBe("interrupted");
    expect(operationExitCode(apply)).toBe(143);
  });

  it("C-15: pre-journal interruption keeps the declared non-rollbackable atomicity", () => {
    const resolution = interruptionResolution(
      {
        command: "update",
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
    expect(operationExitCode(resolution)).toBe(130);
  });

  // The journal records per-unit started and resolved facts. A unit whose run
  // began but whose settlement was not observed is in flight at the stopping
  // point: for a non-rollbackable family its durable effects are unknown —
  // never "not attempted".
  it("C-15: a started unit is never reported as not attempted", () => {
    const resolution = interruptionResolution(
      { command: "sync", mode: "apply", planName: "Sync workspace" },
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
    expect(operationExitCode(resolution)).toBe(130);
  });

  it("C-15: an in-flight unit of a restoring apply reports restored effects", () => {
    const resolution = interruptionResolution(
      { command: "update", mode: "apply", planName: "Update extensions" },
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
    expect(operationExitCode(resolution)).toBe(143);
  });

  // Settlement recorded before the interruptible boundary means a commit that
  // finished just before the signal reports as committed — even though the
  // operation never reached its normal emit.
  it("C-15: interruption after local commit but before emit reports the commit", () => {
    const resolution = interruptionResolution(
      { command: "skills.install", mode: "apply", planName: "Install skill" },
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
    const resolution = interruptionResolution(
      { command: "update", mode: "apply", planName: "Update extensions" },
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

  // Lock lifetime is a design invariant, not a contract obligation, so this
  // test carries no obligation ID.
  it.effect("does not hold the workspace transition before the body confirms", () =>
    Effect.gen(function* () {
      const workspaceDir = nodePath.join(tempDir, ".axm");
      const resolved = nodePath.resolve(workspaceDir);
      const renderer = TestRenderer.make();
      // Planning, registry acquisition, preview, and the confirmation
      // decision all run inside the body; holding the workspace transition
      // across them lets a slow download or an open prompt monopolize the
      // workspace. The transition is acquired only after confirmation, for
      // revalidation through apply.
      let heldAtBodyStart: boolean | undefined;
      yield* withOperationLifecycle(
        { command: "update", mode: "apply", planName: "Update extensions" },
        Effect.sync(() => {
          heldAtBodyStart = isWorkspaceTransitionHeldByThisInvocation(resolved);
        }),
      ).pipe(
        Effect.provide(
          Layer.mergeAll(
            NodeServices.layer,
            renderer.layer,
            TestFlagsLayer({ nonInteractive: true }),
            WorkspaceMutations.layer(makeBaseWorkspaceMock(workspaceDir)),
          ),
        ),
      );
      expect(heldAtBodyStart).toBe(false);
    }),
  );
});

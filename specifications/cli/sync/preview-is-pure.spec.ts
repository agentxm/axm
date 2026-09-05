import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { getAppError, handleInstall, handleSync } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";
import { probeFlag } from "../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/sync/preview-is-pure",
  title: "Sync preview describes the reconciliation without changing any state",
  statement:
    "When sync runs in preview mode against a workspace whose managed state has drifted from desired state, it shall report the reconciliation it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/sync/realizes-desired-state"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Sync preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /** An installed skill whose agent projection was deleted, so sync has work to do. */
  const driftedWorkspace = () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        recordWrites: true,
      });
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      yield* handleInstall({
        source: Option.some(skillPackage),
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      fs.rmSync(path.join(workspace.root, ".claude", "skills", "code-review"), {
        recursive: true,
        force: true,
      });
      expect(workspace.exists(".claude/skills/code-review")).toBe(false);
      const before = snapshotProtectedState(workspace.root);
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);
      return { workspace, before };
    });

  it.effect("a previewed reconciliation changes no protected state", () =>
    Effect.gen(function* () {
      const { workspace, before } = yield* driftedWorkspace();

      yield* handleSync({ preview: true }).pipe(Effect.provide(workspace.layer));

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.exists(".claude/skills/code-review")).toBe(false);
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.ok).toBe(true);
      expect(entry?.data).toMatchObject({
        result: { outcome: "previewed", counts: { committed: 0 } },
      });
    }),
  );

  it.effect("a previewed reconciliation asked to fail on change changes no protected state", () =>
    Effect.gen(function* () {
      const { workspace, before } = yield* driftedWorkspace();

      yield* handleSync({ preview: true, failOnChange: true }).pipe(
        Effect.provide(workspace.layer),
      );

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.exists(".claude/skills/code-review")).toBe(false);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: { outcome: "previewed", counts: { committed: 0 } },
      });
    }),
  );

  it.effect(
    "a previewed reconciliation of a desired extension whose source is missing reports it and changes nothing",
    () =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({
          machine: true,
          flags: { json: true },
          recordWrites: true,
          settings: { skills: { ghost: "./vendor/ghost" } },
        });
        cleanups.push(workspace.cleanup);
        const before = snapshotProtectedState(workspace.root);
        workspace.writes.splice(0);
        workspace.rendererState.results.splice(0);

        const failure = yield* handleSync({ preview: true }).pipe(
          Effect.provide(workspace.layer),
          Effect.flip,
        );

        expect(getAppError(failure).detail).toContain("ghost");
        expectProtectedStateUntouched({
          root: workspace.root,
          before,
          writes: workspace.writes,
        });
        expect(workspace.exists(".claude/skills/ghost")).toBe(false);
        expect(workspace.readLockfileText()).not.toContain("ghost");
        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
        expect(workspace.rendererState.results).toEqual([]);
      }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["sync"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["sync"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["sync"], "-y")).toBe("unrecognized");
    }),
  );
});

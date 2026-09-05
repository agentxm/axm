import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { getAppError, handleInstallPack } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";
import { makeSpecRegistry } from "../../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/packs/install/preview-is-pure",
  title: "Pack install preview describes the pack and members without changing state",
  statement:
    "When packs install runs in preview mode against a Registry pack, it shall report the pack and members it would install with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/install/preview-is-pure"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Pack install preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /** A workspace whose Registry publishes one pack depending on one skill. */
  const registryWorkspace = () => {
    const registry = makeSpecRegistry();
    cleanups.push(registry.cleanup);
    registry.writeSkill("member-skill", [{ version: "1.0.0", body: "Member guidance." }]);
    registry.writePack("toolkit", [
      { version: "1.0.0", dependencies: { "@acme/skills/member-skill": "^1.0.0" } },
    ]);
    const workspace = makeSpecWorkspace({
      machine: true,
      flags: { json: true },
      recordWrites: true,
      settings: { sources: [registry.source] },
    });
    cleanups.push(workspace.cleanup);
    return workspace;
  };

  it.effect("a previewed install of a Registry pack changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = registryWorkspace();
      const before = snapshotProtectedState(workspace.root);
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);

      yield* handleInstallPack(
        { source: Option.some("@acme/packs/toolkit") },
        { force: false, preview: true },
      ).pipe(Effect.provide(workspace.layer));

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.readLockfileText()).not.toContain("toolkit");
      expect(workspace.exists("agent_extensions")).toBe(false);
      expect(workspace.exists(".claude/skills/member-skill")).toBe(false);
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          units: expect.arrayContaining([
            expect.objectContaining({
              label: expect.stringContaining("toolkit"),
              state: "ready",
            }),
          ]),
        },
      });
    }),
  );

  it.effect(
    "a previewed install of a pack the Registry does not publish reports the failure and changes nothing",
    () =>
      Effect.gen(function* () {
        const workspace = registryWorkspace();
        const before = snapshotProtectedState(workspace.root);
        workspace.writes.splice(0);

        const failure = yield* handleInstallPack(
          { source: Option.some("@acme/packs/absent-pack") },
          { force: false, preview: true },
        ).pipe(Effect.provide(workspace.layer), Effect.flip);

        expect(getAppError(failure)._tag).toBe("AppError");
        expectProtectedStateUntouched({
          root: workspace.root,
          before,
          writes: workspace.writes,
        });
        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["packs", "install"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["packs", "install"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["packs", "install"], "-y")).toBe("unrecognized");
    }),
  );
});

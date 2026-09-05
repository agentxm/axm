import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstallPack, handleUninstallPack } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";
import { makeSpecRegistry } from "../../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/packs/uninstall/preview-is-pure",
  title: "Pack uninstall preview describes the removal without changing any state",
  statement:
    "When packs uninstall runs in preview mode against an installed pack, it shall report the pack and orphaned members it would remove with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/install/preview-is-pure"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Pack uninstall preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /** A workspace with one Registry pack and its member skill installed. */
  const installedPackWorkspace = Effect.gen(function* () {
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
    yield* handleInstallPack(
      { source: Option.some("@acme/packs/toolkit") },
      { force: false, preview: false },
    ).pipe(Effect.provide(workspace.layer));
    expect(workspace.readLockfileText()).toContain("toolkit");
    expect(workspace.exists(".claude/skills/member-skill")).toBe(true);
    return workspace;
  });

  it.effect("a previewed uninstall of an installed pack changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = yield* installedPackWorkspace;
      const before = snapshotProtectedState(workspace.root);
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);

      yield* handleUninstallPack({ name: "toolkit" }, { preview: true }).pipe(
        Effect.provide(workspace.layer),
      );

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.readLockfileText()).toContain("toolkit");
      expect(workspace.exists(".claude/skills/member-skill")).toBe(true);
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      // The pack graph transition is one closure unit; the pack and the member
      // it would orphan are its removed targets.
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          units: [
            expect.objectContaining({
              state: "ready",
              artifact: expect.objectContaining({
                change: "removed",
                targets: expect.arrayContaining([
                  { path: "agent_extensions/@acme/packs/toolkit", change: "removed" },
                  { path: "agent_extensions/@acme/skills/member-skill", change: "removed" },
                ]),
              }),
            }),
          ],
        },
      });
    }),
  );

  it.effect(
    "a previewed uninstall matching no pack reports nothing to remove and changes nothing",
    () =>
      Effect.gen(function* () {
        const workspace = yield* installedPackWorkspace;
        const before = snapshotProtectedState(workspace.root);
        workspace.writes.splice(0);
        workspace.rendererState.results.splice(0);

        yield* handleUninstallPack({ name: "absent-pack" }, { preview: true }).pipe(
          Effect.provide(workspace.layer),
        );

        expectProtectedStateUntouched({
          root: workspace.root,
          before,
          writes: workspace.writes,
        });
        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
        const [entry] = workspace.rendererState.results;
        expect(entry?.data).toMatchObject({ result: { units: [] } });
      }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["packs", "uninstall"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["packs", "uninstall"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["packs", "uninstall"], "-y")).toBe("unrecognized");
    }),
  );
});

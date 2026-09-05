import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstall, handleUpdate } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../support/install-harness.js";
import { probeFlag } from "../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../support/preview-purity.js";
import { makeSpecRegistry, type RegistrySkillVersion } from "../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/update/preview-is-pure",
  title: "Update preview describes the advance without changing any state",
  statement:
    "When update runs in preview mode against a desired extension with a newer eligible version, it shall report the advance it would apply with a previewed outcome, including any publisher change the acceptance would make, and shall not change settings, the lockfile, canonical content, or agent projections.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/update/advances-resolution-within-intent"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Update preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const firstVersion: RegistrySkillVersion = { version: "1.0.0", body: "First guidance." };

  /** A workspace holding the accepted first version after the Registry publishes a second. */
  const workspaceWithNewerPublication = () =>
    Effect.gen(function* () {
      const registry = makeSpecRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill("code-review", [firstVersion]);
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        recordWrites: true,
        settings: { sources: [registry.source] },
      });
      cleanups.push(workspace.cleanup);
      yield* handleInstall({
        source: Option.some("@acme/skills/code-review"),
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      registry.writeSkill("code-review", [
        { version: "1.1.0", body: "Second guidance." },
        firstVersion,
      ]);
      return workspace;
    });

  it.effect("a previewed update to a newer version changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = yield* workspaceWithNewerPublication();
      const before = snapshotProtectedState(workspace.root);
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);

      yield* handleUpdate({
        source: Option.some("@acme/skills/code-review"),
        force: false,
        preview: true,
      }).pipe(Effect.provide(workspace.layer));

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.readLockfileText()).toContain("resolvedVersion: 1.0.0");
      expect(workspace.readFile(".claude/skills/code-review/SKILL.md")).toContain(
        "First guidance.",
      );
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: { outcome: "previewed", counts: { total: 1, committed: 0 } },
      });

      // The previewed work is real: applying the same request advances the
      // accepted resolution the preview left untouched.
      yield* handleUpdate({
        source: Option.some("@acme/skills/code-review"),
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      expect(workspace.readLockfileText()).toContain("resolvedVersion: 1.1.0");
      expect(workspace.readFile(".claude/skills/code-review/SKILL.md")).toContain(
        "Second guidance.",
      );
    }),
  );

  it.effect(
    "a previewed update that would change publisher reports the change and changes nothing",
    () =>
      Effect.gen(function* () {
        const workspace = yield* workspaceWithNewerPublication();
        // The Registry now binds the extension to a different publisher than
        // the one this workspace accepted.
        const lock = workspace.readLockfileText();
        expect(lock).toContain("publisherBindingId: hbnd_test");
        fs.writeFileSync(
          path.join(workspace.root, "axm-lock.yaml"),
          lock.replace("publisherBindingId: hbnd_test", "publisherBindingId: hbnd_previous"),
        );
        const before = snapshotProtectedState(workspace.root);
        workspace.writes.splice(0);
        workspace.rendererState.results.splice(0);

        yield* handleUpdate({
          source: Option.some("@acme/skills/code-review"),
          force: false,
          preview: true,
        }).pipe(Effect.provide(workspace.layer));

        expectProtectedStateUntouched({
          root: workspace.root,
          before,
          writes: workspace.writes,
        });
        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
        const [entry] = workspace.rendererState.results;
        expect(entry?.data).toMatchObject({
          result: {
            outcome: "previewed",
            riskConditions: expect.arrayContaining([
              expect.objectContaining({
                id: "publisher-ownership-change",
                level: "confirmable",
                consent: "interactive-only",
              }),
            ]),
          },
        });
      }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["update"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["update"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["update"], "-y")).toBe("unrecognized");
    }),
  );
});

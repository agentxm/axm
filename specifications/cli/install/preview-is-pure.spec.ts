import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstall } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";
import { probeFlag } from "../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../support/preview-purity.js";
import { makeSpecRegistry } from "../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/install/preview-is-pure",
  title: "Install preview describes the plan without changing any state",
  statement:
    "When install runs in preview mode, it shall report the planned closure with a previewed outcome, including any publisher change the acceptance would make, and shall not change settings, the lockfile, canonical content, or agent projections.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Install preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("a previewed install of a local package changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        recordWrites: true,
      });
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      const before = snapshotProtectedState(workspace.root);
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);

      yield* handleInstall({
        source: Option.some(skillPackage),
        force: false,
        preview: true,
      }).pipe(Effect.provide(workspace.layer));

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.exists(".claude/skills/code-review")).toBe(false);
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: { outcome: "previewed", counts: { total: 1, committed: 0 } },
      });
    }),
  );

  it.effect(
    "a previewed reinstall that would change publisher reports the change and changes nothing",
    () =>
      Effect.gen(function* () {
        const registry = makeSpecRegistry();
        cleanups.push(registry.cleanup);
        registry.writeSkill("code-review", [{ version: "1.0.0", body: "First guidance." }]);
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
        // The Registry now binds the same extension to a different publisher
        // than the one this workspace accepted.
        const lock = workspace.readLockfileText();
        expect(lock).toContain("publisherBindingId: hbnd_test");
        fs.writeFileSync(
          path.join(workspace.root, "axm-lock.yaml"),
          lock.replace("publisherBindingId: hbnd_test", "publisherBindingId: hbnd_previous"),
        );
        const before = snapshotProtectedState(workspace.root);
        workspace.writes.splice(0);
        workspace.rendererState.results.splice(0);

        yield* handleInstall({
          source: Option.some("@acme/skills/code-review"),
          force: true,
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
      expect(yield* probeFlag(["install"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["install"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["install"], "-y")).toBe("unrecognized");
    }),
  );
});

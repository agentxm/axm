import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstall, handleSkillsUpdate } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";
import { makeSpecRegistry, type SpecRegistry } from "../../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/skills/update/preview-is-pure",
  title: "Skill update preview describes the available update without changing any state",
  statement:
    "When skills update runs in preview mode while the Registry serves a newer version of an accepted skill, it shall report the update it would apply with a previewed outcome, shall report a changed publisher binding as a condition that only interactive approval satisfies, and shall not change settings, the lockfile, canonical content, or agent projections.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity", "trustworthy-distribution"],
  methods: ["example"],
  derivedFrom: [
    "cli/update/advances-resolution-within-intent",
    "packages/cli/src/root/skills/update/handler.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const SKILL = "code-review";
const FIRST = { version: "1.0.0", body: "First guidance." };
const SECOND = { version: "2.0.0", body: "Second guidance." };

/** Republish the skill's index under a different publisher binding. */
const republishUnderDifferentPublisher = (registry: SpecRegistry, name: string): void => {
  const indexPath = path.join(registry.root, "extensions", "@acme", "skills", name, "index.json");
  const index: unknown = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  if (typeof index !== "object" || index === null) {
    throw new Error(`Registry index for ${name} is not an object`);
  }
  fs.writeFileSync(
    indexPath,
    `${JSON.stringify({ ...index, publisherBindingId: "hbnd_other" }, null, 2)}\n`,
  );
};

describe("Skill update preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /**
   * A workspace holding the accepted first version of a Registry skill, after
   * which the Registry publishes a second version.
   */
  const workspaceWithNewerPublication = () =>
    Effect.gen(function* () {
      const registry = makeSpecRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill(SKILL, [FIRST]);
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        recordWrites: true,
        settings: { sources: [registry.source] },
      });
      cleanups.push(workspace.cleanup);
      yield* handleInstall({
        source: Option.some(`@acme/skills/${SKILL}`),
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      expect(workspace.readLockfileText()).toContain("resolvedVersion: 1.0.0");
      registry.writeSkill(SKILL, [SECOND, FIRST]);
      return { registry, workspace };
    });

  const previewUpdate = (workspace: ReturnType<typeof makeSpecWorkspace>) =>
    handleSkillsUpdate({ source: Option.none(), skills: [], force: false, preview: true }).pipe(
      Effect.provide(workspace.layer),
    );

  it.effect("a previewed update to a newer version changes no protected state", () =>
    Effect.gen(function* () {
      const { workspace } = yield* workspaceWithNewerPublication();
      const before = snapshotProtectedState(workspace.root);
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);

      yield* previewUpdate(workspace);

      expectProtectedStateUntouched({ root: workspace.root, before, writes: workspace.writes });
      expect(workspace.readLockfileText()).toContain("resolvedVersion: 1.0.0");
      expect(workspace.readFile(`.claude/skills/${SKILL}/SKILL.md`)).toContain(FIRST.body);
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          units: [expect.objectContaining({ label: SKILL, state: "ready" })],
        },
      });

      // The previewed work is real: applying the same request advances the
      // accepted resolution the preview left untouched.
      yield* handleSkillsUpdate({
        source: Option.none(),
        skills: [],
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      expect(workspace.readLockfileText()).toContain("resolvedVersion: 2.0.0");
      expect(workspace.readFile(`.claude/skills/${SKILL}/SKILL.md`)).toContain(SECOND.body);
    }),
  );

  it.effect(
    "a previewed update across a changed publisher binding reports the interactive-only condition and changes nothing",
    () =>
      Effect.gen(function* () {
        const { registry, workspace } = yield* workspaceWithNewerPublication();
        republishUnderDifferentPublisher(registry, SKILL);
        const before = snapshotProtectedState(workspace.root);
        workspace.writes.splice(0);
        workspace.rendererState.results.splice(0);

        yield* previewUpdate(workspace);

        expectProtectedStateUntouched({ root: workspace.root, before, writes: workspace.writes });
        expect(workspace.readLockfileText()).toContain("publisherBindingId: hbnd_test");
        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
        const [entry] = workspace.rendererState.results;
        expect(entry?.data).toMatchObject({
          result: {
            outcome: "previewed",
            riskConditions: [
              expect.objectContaining({
                level: "confirmable",
                consent: "interactive-only",
                id: "publisher-ownership-change",
              }),
            ],
          },
        });
        expect(JSON.stringify(entry?.data)).toContain("Publisher identity changed");
      }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["skills", "update"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["skills", "update"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["skills", "update"], "-y")).toBe("unrecognized");
    }),
  );
});

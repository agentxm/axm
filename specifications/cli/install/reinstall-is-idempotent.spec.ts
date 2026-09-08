import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstall, PlanResolutionDocumentSchema } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";
import { snapshotWorkspaceContent } from "../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/install/reinstall-is-idempotent",
  title: "Installing an already desired extension at the same constraint is a successful no-op",
  statement:
    "When a person reinstalls an extension the workspace already desires at the same constraint, the install shall succeed with a no-op outcome and shall not change settings, the lockfile, canonical content, or agent projections.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "When installed files differ from the accepted content, should a repeated install restore that content and report a repair, or refuse until the user explicitly chooses recovery? The unchanged-state example does not decide this case.",
    "Applying a satisfied install reports `no-op` while previewing the same request reports `previewed`, because the outcome follows planned units and only execution observes that a unit changes nothing. Should a preview that would change nothing report `no-op`, and if so must every planner decide the satisfied case before planning?",
  ],
});

describe("Repeat installs are safe", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("repeating an install reports an unchanged no-op", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        storage: "memory",
        machine: true,
        flags: { json: true },
      });
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace, { name: "code-review" });
      const install = workspace.provide(
        handleInstall({
          source: Option.some(skillPackage),
          force: false,
          preview: false,
        }),
      );

      yield* install;
      const settingsAfterFirst = JSON.stringify(workspace.readSettings());
      const lockAfterFirst = workspace.readLockfileText();
      const canonicalAfterFirst = workspace.snapshotTree("agent_extensions");
      const projectionAfterFirst = workspace.snapshotTree(".claude");

      yield* install;

      const [, secondResult] = workspace.rendererState.results;
      expect(secondResult).toBeDefined();
      expect(secondResult?.data).toMatchObject({ result: { outcome: "no-op" } });

      expect(JSON.stringify(workspace.readSettings())).toBe(settingsAfterFirst);
      expect(workspace.readLockfileText()).toBe(lockAfterFirst);
      expect(workspace.snapshotTree("agent_extensions")).toEqual(canonicalAfterFirst);
      expect(workspace.snapshotTree(".claude")).toEqual(projectionAfterFirst);
      expect(workspace.transitionCounts?.()).toEqual({ acquisitions: 2, releases: 2 });
    }),
  );

  it.effect(
    "previewing a repeated install reports a no-op and preserves the complete workspace",
    () =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
        cleanups.push(workspace.cleanup);
        const source = writeLocalSkillPackage(workspace.root, { name: "code-review" });
        yield* handleInstall({ source: Option.some(source), force: false, preview: false }).pipe(
          Effect.provide(workspace.layer),
        );
        const installed = yield* Schema.decodeUnknownEffect(PlanResolutionDocumentSchema)(
          workspace.rendererState.results.at(-1)?.data,
        );
        expect(installed.result).toMatchObject({
          outcome: "applied",
          counts: { committed: 1, failed: 0, blocked: 0 },
        });
        const sourceContent = workspace.readFile("vendor/code-review/src/SKILL.md");
        expect(sourceContent).toContain("# code-review");
        expect(workspace.readFile("agent_extensions/local/vendor/code-review/src/SKILL.md")).toBe(
          sourceContent,
        );
        expect(workspace.readFile(".claude/skills/code-review/SKILL.md")).toBe(sourceContent);
        expect(workspace.readFile(".agents/skills/code-review/SKILL.md")).toBe(sourceContent);
        expect(workspace.readLockfileText()).toContain("code-review");
        const before = snapshotWorkspaceContent(workspace.root);
        workspace.rendererState.results.splice(0);

        yield* handleInstall({ source: Option.some(source), force: false, preview: true }).pipe(
          Effect.provide(workspace.layer),
        );

        expect(workspace.rendererState.results).toHaveLength(1);
        const previewed = yield* Schema.decodeUnknownEffect(PlanResolutionDocumentSchema)(
          workspace.rendererState.results.at(-1)?.data,
        );
        // Preview reports the planned unit, not the applied disposition; the
        // open question above owns whether it should settle to a no-op. The
        // committed count and the unchanged workspace carry the purity claim.
        expect(previewed.result).toMatchObject({
          outcome: "previewed",
          counts: { committed: 0, failed: 0, blocked: 0 },
        });
        expect(snapshotWorkspaceContent(workspace.root)).toEqual(before);
      }),
  );
});

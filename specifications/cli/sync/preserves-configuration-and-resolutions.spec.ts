import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import YAML from "yaml";

import { handleInstall, handleSync } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";
import { makeSpecRegistry } from "../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/sync/preserves-configuration-and-resolutions",
  title: "Sync never changes configuration and never advances a satisfying resolution",
  statement:
    "Sync shall never rewrite axm.json or alter an accepted resolution that still satisfies its constraint, and shall restore realized content from the accepted resolution even when a newer version is available.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Sync preserves configuration and accepted resolutions", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("preserves equivalent repository serialization and reports no work", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      yield* handleInstall({
        source: Option.some(skillPackage),
        yes: true,
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));

      const settingsBefore = `${JSON.stringify(workspace.readSettings(), null, 4)}\n`;
      fs.writeFileSync(path.join(workspace.root, "axm.json"), settingsBefore);
      const decodedLockfile: unknown = YAML.parse(workspace.readLockfileText());
      const lockfileBefore = `# Repository-owned YAML serialization\n${YAML.stringify(
        decodedLockfile,
        { indent: 4 },
      )}`;
      fs.writeFileSync(path.join(workspace.root, "axm-lock.yaml"), lockfileBefore);

      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

      expect(workspace.readFile("axm.json")).toBe(settingsBefore);
      expect(workspace.readLockfileText()).toBe(lockfileBefore);
      const lastResult = workspace.rendererState.results.at(-1);
      expect(lastResult?.data).toMatchObject({
        result: { outcome: "no-op", counts: { total: 0 } },
      });
    }),
  );

  it.effect(
    "restores realized state from the accepted resolution instead of an available newer version",
    () =>
      Effect.gen(function* () {
        const registry = makeSpecRegistry();
        cleanups.push(registry.cleanup);
        registry.writeSkill("code-review", [{ version: "1.0.0", body: "First guidance." }]);
        const workspace = makeSpecWorkspace({
          machine: true,
          flags: { json: true },
          settings: { sources: [registry.source] },
        });
        cleanups.push(workspace.cleanup);
        yield* handleInstall({
          source: Option.some("@acme/skills/code-review"),
          yes: true,
          force: false,
          preview: false,
        }).pipe(Effect.provide(workspace.layer));

        registry.writeSkill("code-review", [
          { version: "1.0.0", body: "First guidance." },
          { version: "2.0.0", body: "Second guidance." },
        ]);
        const settingsBefore = JSON.stringify(workspace.readSettings());
        const lockfileBefore = workspace.readLockfileText();
        fs.rmSync(path.join(workspace.root, ".claude", "skills", "code-review"), {
          recursive: true,
          force: true,
        });

        yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

        expect(workspace.readFile(".claude/skills/code-review/SKILL.md")).toContain(
          "First guidance.",
        );
        expect(workspace.readLockfileText()).toBe(lockfileBefore);
        expect(JSON.stringify(workspace.readSettings())).toBe(settingsBefore);
      }),
  );
});

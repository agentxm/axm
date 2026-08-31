import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstall, handleSync } from "axm.sh/specification-harness";

import { defineSpecification } from "../../support/contract.js";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";
import { makeSpecRegistry } from "../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/sync/preserves-configuration-and-resolutions",
  title: "Sync never changes configuration and never advances a satisfying resolution",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
});

describe("Sync preserves configuration and accepted resolutions", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("leaves a fully realized workspace byte-identical and reports no work", () =>
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
      const settingsBefore = JSON.stringify(workspace.readSettings());
      const lockfileBefore = workspace.readLockfileText();

      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

      expect(JSON.stringify(workspace.readSettings())).toBe(settingsBefore);
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

  it.effect(
    "resolves a desired extension without a resolution once, changing no configuration",
    () =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({
          machine: true,
          flags: { json: true },
          settings: { skills: { "code-review": "./vendor/code-review" } },
        });
        cleanups.push(workspace.cleanup);
        writeLocalSkillPackage(workspace.root, { name: "code-review" });
        const settingsBefore = JSON.stringify(workspace.readSettings());
        expect(workspace.readLockfileText()).not.toContain("code-review");

        yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

        const lockfileAfter = workspace.readLockfileText();
        expect(lockfileAfter).toContain("code-review");
        expect(lockfileAfter).toContain("type: local");
        expect(JSON.stringify(workspace.readSettings())).toBe(settingsBefore);
        expect(workspace.exists("agent_extensions/local/vendor/code-review/src/SKILL.md")).toBe(
          true,
        );
        expect(workspace.exists(".claude/skills/code-review")).toBe(true);
      }),
  );
});

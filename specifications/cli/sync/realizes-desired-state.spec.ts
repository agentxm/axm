import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstall, handleSync } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/sync/realizes-desired-state",
  title: "Sync realizes desired additions and removes what desired state no longer includes",
  statement:
    "Sync shall realize each desired extension AXM owns, recording a first accepted resolution for one that has none and restoring missing agent projections from canonical content and missing canonical content from the exact accepted identity, shall remove owned outputs that desired state no longer includes, and shall report a no-op once managed state agrees with desired state.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "agent-interoperability"],
  methods: ["example"],
  derivedFrom: ["cli/sync/preserves-configuration-and-resolutions"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Sync realizes desired workspace state", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const installedWorkspace = () =>
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
      return workspace;
    });

  it.effect(
    "records a first accepted resolution for a desired extension that has none and realizes it",
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

  it.effect("restores a deleted agent projection from canonical content", () =>
    Effect.gen(function* () {
      const workspace = yield* installedWorkspace();
      const canonicalContent = workspace.readFile(
        "agent_extensions/local/vendor/code-review/src/SKILL.md",
      );
      fs.rmSync(path.join(workspace.root, ".claude", "skills", "code-review"), {
        recursive: true,
        force: true,
      });

      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

      expect(workspace.readFile(".claude/skills/code-review/SKILL.md")).toBe(canonicalContent);
      const lastResult = workspace.rendererState.results.at(-1);
      expect(lastResult?.data).toMatchObject({
        result: { outcome: "applied", counts: { committed: 1, failed: 0, blocked: 0 } },
      });
    }),
  );

  it.effect("restores deleted canonical content from the exact accepted identity", () =>
    Effect.gen(function* () {
      const workspace = yield* installedWorkspace();
      const sourceContent = workspace.readFile("vendor/code-review/src/SKILL.md");
      const lockfileBefore = workspace.readLockfileText();
      fs.rmSync(path.join(workspace.root, "agent_extensions"), { recursive: true, force: true });

      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

      expect(workspace.readFile("agent_extensions/local/vendor/code-review/src/SKILL.md")).toBe(
        sourceContent,
      );
      expect(workspace.exists(".claude/skills/code-review")).toBe(true);
      expect(workspace.readLockfileText()).toBe(lockfileBefore);
    }),
  );

  it.effect("reports an up-to-date workspace once managed state agrees with desired state", () =>
    Effect.gen(function* () {
      const workspace = yield* installedWorkspace();
      fs.rmSync(path.join(workspace.root, ".claude", "skills", "code-review"), {
        recursive: true,
        force: true,
      });
      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

      const lastResult = workspace.rendererState.results.at(-1);
      expect(lastResult?.data).toMatchObject({
        result: { outcome: "no-op", counts: { total: 0 } },
      });
    }),
  );

  it.effect(
    "removes owned projections that desired state no longer includes and then reports a no-op",
    () =>
      Effect.gen(function* () {
        const workspace = yield* installedWorkspace();
        expect(workspace.exists(".agents/skills/code-review")).toBe(true);

        workspace.writeSettings({ owner: "@acme", agents: ["claude-code"], skills: {} });
        yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

        expect(workspace.exists(".agents/skills/code-review")).toBe(false);
        yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));
        expect(workspace.rendererState.results.at(-1)?.data).toMatchObject({
          result: { outcome: "no-op", counts: { total: 0 } },
        });
      }),
  );
});

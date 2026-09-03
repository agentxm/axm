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
  title: "Sync converges AXM-owned outputs bidirectionally on desired state",
  statement:
    "Sync shall converge AXM-owned outputs on desired state, restoring missing projections from canonical content and missing canonical content from the exact accepted identity, removing owned outputs desired state no longer reaches, and reporting a no-op once managed state agrees with desired state.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "agent-interoperability"],
  methods: ["example"],
  derivedFrom: [],
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
    "removes universal projections after a direct settings edit and then becomes a no-op",
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

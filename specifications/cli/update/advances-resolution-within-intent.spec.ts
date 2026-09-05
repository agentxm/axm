import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstall, handleUpdate } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";
import { makeSpecRegistry, type RegistrySkillVersion } from "../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/update/advances-resolution-within-intent",
  title: "Update advances the accepted resolution within durable intent",
  statement:
    "Update of a desired Registry extension shall advance its accepted resolution and realized content to the newest version within the durable constraint without changing axm.json or any other extension, and shall be a no-op when already current.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Update a desired Registry extension", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const firstVersion: RegistrySkillVersion = { version: "1.0.0", body: "First guidance." };

  /**
   * A workspace holding the accepted first version of a Registry skill,
   * installed through the given locator, and one unrelated local skill, after
   * which the Registry publishes the later versions.
   */
  const workspaceWithNewerPublication = (options?: {
    readonly locator?: string;
    readonly later?: ReadonlyArray<RegistrySkillVersion>;
  }) =>
    Effect.gen(function* () {
      const registry = makeSpecRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill("code-review", [firstVersion]);
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: { sources: [registry.source] },
      });
      cleanups.push(workspace.cleanup);
      yield* handleInstall({
        source: Option.some(options?.locator ?? "@acme/skills/code-review"),
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      const unrelated = writeLocalSkillPackage(workspace.root, { name: "release-notes" });
      yield* handleInstall({
        source: Option.some(unrelated),
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      registry.writeSkill("code-review", [
        firstVersion,
        ...(options?.later ?? [{ version: "2.0.0", body: "Second guidance." }]),
      ]);
      return workspace;
    });

  const update = (workspace: ReturnType<typeof makeSpecWorkspace>, target: string) =>
    handleUpdate({
      source: Option.some(target),
      force: false,
      preview: false,
    }).pipe(Effect.provide(workspace.layer));

  it.effect(
    "advances the accepted resolution and realized content to a later published version",
    () =>
      Effect.gen(function* () {
        const workspace = yield* workspaceWithNewerPublication();
        expect(workspace.readLockfileText()).toContain("resolvedVersion: 1.0.0");

        yield* update(workspace, "@acme/skills/code-review");

        expect(workspace.readLockfileText()).toContain("resolvedVersion: 2.0.0");
        expect(workspace.readFile(".claude/skills/code-review/SKILL.md")).toContain(
          "Second guidance.",
        );
        const lastResult = workspace.rendererState.results.at(-1);
        expect(lastResult?.data).toMatchObject({
          result: { outcome: "applied", counts: { committed: 1, failed: 0, blocked: 0 } },
        });
      }),
  );

  it.effect("advances only to the newest version the recorded constraint allows", () =>
    Effect.gen(function* () {
      const workspace = yield* workspaceWithNewerPublication({
        locator: "@acme/skills/code-review@^1.0.0",
        later: [
          { version: "1.1.0", body: "Compatible guidance." },
          { version: "2.0.0", body: "Second guidance." },
        ],
      });

      yield* update(workspace, "@acme/skills/code-review");

      expect(workspace.readLockfileText()).toContain("resolvedVersion: 1.1.0");
      expect(workspace.readFile(".claude/skills/code-review/SKILL.md")).toContain(
        "Compatible guidance.",
      );
      const lastResult = workspace.rendererState.results.at(-1);
      expect(lastResult?.data).toMatchObject({
        result: { outcome: "applied", counts: { committed: 1, failed: 0, blocked: 0 } },
      });
    }),
  );

  it.effect("changes no workspace configuration and no unrelated extension", () =>
    Effect.gen(function* () {
      const workspace = yield* workspaceWithNewerPublication();
      const settingsBefore = JSON.stringify(workspace.readSettings());
      const unrelatedProjection = workspace.readFile(".claude/skills/release-notes/SKILL.md");
      const unrelatedIdentity = /release-notes:[\s\S]*?contentIdentity: ([0-9a-f]{64})/.exec(
        workspace.readLockfileText(),
      )?.[1];
      expect(unrelatedIdentity).toBeDefined();

      yield* update(workspace, "@acme/skills/code-review");

      expect(JSON.stringify(workspace.readSettings())).toBe(settingsBefore);
      expect(workspace.readFile(".claude/skills/release-notes/SKILL.md")).toBe(unrelatedProjection);
      expect(workspace.readLockfileText()).toContain(unrelatedIdentity ?? "");
      expect(
        workspace.readFile("agent_extensions/local/vendor/release-notes/src/SKILL.md"),
      ).toContain("release-notes");
    }),
  );

  it.effect("repeating an update at the advanced resolution reports a no-op", () =>
    Effect.gen(function* () {
      const workspace = yield* workspaceWithNewerPublication();
      yield* update(workspace, "@acme/skills/code-review");
      const lockfileAfterFirst = workspace.readLockfileText();

      yield* update(workspace, "@acme/skills/code-review");

      const lastResult = workspace.rendererState.results.at(-1);
      expect(lastResult?.data).toMatchObject({ result: { outcome: "no-op" } });
      expect(workspace.readLockfileText()).toBe(lockfileAfterFirst);
    }),
  );
});

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  extensionName,
  handleInstall,
  handlePacksAdd,
  handlePacksNew,
  handleSync,
  handleUninstall,
} from "axm.sh/unstable/specification-harness";

import { defineSpecification } from "../../support/contract.js";
import { makeSpecWorkspace } from "../../support/install-harness.js";
import { makeSpecRegistry } from "../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/packs/authored-packs-expand-membership",
  title: "Authored packs grow membership that stays reachable through the pack",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity", "extension-adoption"],
  methods: ["example"],
});

describe("Authored pack membership", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /**
   * A workspace holding one accepted Registry skill and one freshly authored
   * workspace pack, the starting point for growing pack membership.
   */
  const workspaceWithSkillAndPack = () =>
    Effect.gen(function* () {
      const registry = makeSpecRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill("member-skill", [{ version: "1.0.0", body: "Member guidance." }]);
      const workspace = makeSpecWorkspace({ settings: { sources: [registry.source] } });
      cleanups.push(workspace.cleanup);
      yield* handleInstall({
        source: Option.some("@acme/skills/member-skill"),
        yes: true,
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      yield* handlePacksNew({
        name: extensionName("toolkit"),
        owner: Option.none(),
        yes: true,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      return workspace;
    });

  const addMember = (workspace: ReturnType<typeof makeSpecWorkspace>) =>
    handlePacksAdd({
      pack: "toolkit",
      extension: "@acme/skills/member-skill",
      yes: true,
      preview: false,
    }).pipe(Effect.provide(workspace.layer));

  it.effect("creating a pack records workspace authorship with an empty dependency graph", () =>
    Effect.gen(function* () {
      const workspace = yield* workspaceWithSkillAndPack();

      expect(workspace.readSettings()).toMatchObject({ packs: { toolkit: "workspace" } });
      const manifest: unknown = JSON.parse(workspace.readFile("packs/toolkit/pack.json"));
      expect(manifest).toMatchObject({
        owner: "@acme",
        type: "pack",
        name: "toolkit",
        dependencies: {},
      });
      // Workspace authorship is settings-authoritative: no accepted external
      // resolution exists for the authored pack.
      expect(workspace.readLockfileText()).not.toContain("toolkit");
    }),
  );

  it.effect("adding an installed extension records it as a pack dependency", () =>
    Effect.gen(function* () {
      const workspace = yield* workspaceWithSkillAndPack();
      yield* addMember(workspace);

      const manifest: unknown = JSON.parse(workspace.readFile("packs/toolkit/pack.json"));
      expect(manifest).toMatchObject({
        dependencies: { "@acme/skills/member-skill": ">=1.0.0" },
      });
    }),
  );

  it.effect(
    "the member stays resolved and realized through the pack after its direct configuration is removed",
    () =>
      Effect.gen(function* () {
        const workspace = yield* workspaceWithSkillAndPack();
        yield* addMember(workspace);

        yield* handleUninstall({
          source: "@acme/skills/member-skill",
          yes: true,
          preview: false,
        }).pipe(Effect.provide(workspace.layer));
        yield* handleSync({ target: Option.none(), type: Option.none(), preview: false }).pipe(
          Effect.provide(workspace.layer),
        );

        expect(workspace.readSettings()).not.toMatchObject({
          skills: { "member-skill": expect.anything() },
        });
        const lockfile = workspace.readLockfileText();
        expect(lockfile).toContain("member-skill");
        expect(lockfile).toContain("resolvedVersion: 1.0.0");
        expect(
          workspace.exists("agent_extensions/agentxm/@acme/skills/member-skill/src/SKILL.md"),
        ).toBe(true);
        expect(workspace.exists(".claude/skills/member-skill")).toBe(true);
      }),
  );
});

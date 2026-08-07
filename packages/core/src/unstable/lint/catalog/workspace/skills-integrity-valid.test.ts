import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { WorkspaceRuleContext } from "../../context.js";
import { makeWorkspaceReadModel } from "../../../workspace/read-model/service.js";
import { WorkspaceReadModelTest } from "../../../workspace/read-model/__fixtures__/test-layer.js";
import { emptyWorkspaceState, type WorkspaceState } from "../workspace-fixtures/interpret-ops.js";
import { scopeFilesFromWorkspaceState } from "../workspace-fixtures/fixture-state.js";
import { skillsIntegrityValidRule } from "./skills-integrity-valid.js";

const contextFor = (state: WorkspaceState): Effect.Effect<WorkspaceRuleContext> => {
  const project = scopeFilesFromWorkspaceState(state);
  return Effect.gen(function* () {
    const workspace = yield* makeWorkspaceReadModel("project");
    return {
      subject: { root: "/tmp/ws", scope: "project" },
      workspace,
      axmDirExists: Effect.succeed(state.existingPaths.has(".axm")),
      displayRoot: "",
    } satisfies WorkspaceRuleContext;
  }).pipe(
    Effect.provide(
      WorkspaceReadModelTest({
        workspaceRoot: "/tmp/ws",
        userHome: "/tmp/user",
        project,
      }),
    ),
    Effect.orDie,
  );
};

const runCheck = (state: WorkspaceState) =>
  Effect.gen(function* () {
    const context = yield* contextFor(state);
    return yield* skillsIntegrityValidRule.check(context);
  });

const skillLockEntry = (args: { readonly owner: string; readonly name: string }) => ({
  type: "registry",
  owner: args.owner,
  name: args.name,
  resolvedVersion: "1.0.0",
  integrity: "sha512-stub",
  sourceName: "default",
  publisherBindingId: "hbnd_test",
  installedAt: "2026-04-21T00:00:00.000Z",
  updatedAt: "2026-04-21T00:00:00.000Z",
  sourceHash: "sha256-of-original-publisher-bytes",
});

const packLockEntry = (args: { readonly owner: string; readonly name: string }) => ({
  type: "registry",
  owner: args.owner,
  name: args.name,
  resolvedVersion: "1.0.0",
  integrity: "sha512-stub",
  sourceName: "default",
  publisherBindingId: "hbnd_test",
  installedAt: "2026-04-21T00:00:00.000Z",
  updatedAt: "2026-04-21T00:00:00.000Z",
  resolvedSkills: {
    [`${args.owner}/skills/my-skill`]: {
      version: "1.0.0",
      publisherBindingId: "hbnd_test",
    },
  },
  resolvedCommands: {},
  resolvedMcpServers: {},
  resolvedSubagents: {},
});

describe("workspace/skills-integrity-valid", () => {
  it.effect(
    "does not report a present tree whose content differs from sourceHash (workspace-owned)",
    () =>
      Effect.gen(function* () {
        const state = emptyWorkspaceState();
        state.settings = {
          agents: ["claude-code"],
          skills: { "my-skill": { source: "@examples/skills/my-skill@1.0.0" } },
        };
        state.lockfile = {
          lockfileVersion: 3,
          skills: {
            "my-skill": skillLockEntry({ owner: "@examples", name: "my-skill" }),
          },
        };
        // Fixture tree content never hashes to the lock entry's sourceHash —
        // e.g. a formatter rewrote installed files. Presence alone must pass.
        state.existingPaths.add(".axm/extensions/@examples/skills/my-skill/src/SKILL.md");

        const findings = yield* runCheck(state);

        expect(findings).toEqual([]);
      }),
  );

  it.effect("reports a configured skill whose installed source directory is missing", () =>
    Effect.gen(function* () {
      const state = emptyWorkspaceState();
      state.settings = {
        agents: ["claude-code"],
        skills: { "my-skill": { source: "@examples/skills/my-skill@1.0.0" } },
      };
      state.lockfile = {
        lockfileVersion: 3,
        skills: {
          "my-skill": skillLockEntry({ owner: "@examples", name: "my-skill" }),
        },
      };

      const findings = yield* runCheck(state);

      expect(findings).toHaveLength(1);
      const finding = findings[0];
      expect(finding?.kind).toBe("autofixable");
      expect(finding?.message).toContain("its installed source directory is missing");
    }),
  );

  it.effect("accepts retained canonical content for a disabled pack-provided skill", () =>
    Effect.gen(function* () {
      const state = emptyWorkspaceState();
      state.settings = {
        agents: ["claude-code"],
        packs: { starter: { source: "@examples/packs/starter@1.0.0", enabled: false } },
      };
      state.lockfile = {
        lockfileVersion: 3,
        skills: {
          "my-skill": skillLockEntry({ owner: "@examples", name: "my-skill" }),
        },
        packs: {
          starter: packLockEntry({ owner: "@examples", name: "starter" }),
        },
      };
      state.existingPaths.add(".axm/extensions/@examples/skills/my-skill/src/SKILL.md");

      const findings = yield* runCheck(state);

      expect(findings).toEqual([]);
    }),
  );

  it.effect("does not check lock entries without a sourceHash", () =>
    Effect.gen(function* () {
      const state = emptyWorkspaceState();
      const { sourceHash: _sourceHash, ...entryWithoutHash } = skillLockEntry({
        owner: "@examples",
        name: "my-skill",
      });
      state.settings = {
        agents: ["claude-code"],
        skills: { "my-skill": { source: "@examples/skills/my-skill@1.0.0" } },
      };
      state.lockfile = {
        lockfileVersion: 3,
        skills: { "my-skill": entryWithoutHash },
      };

      const findings = yield* runCheck(state);

      expect(findings).toEqual([]);
    }),
  );
});

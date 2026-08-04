import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { WorkspaceRuleContext } from "../../context.js";
import { makeWorkspaceReadModel } from "../../../workspace/read-model/service.js";
import { WorkspaceReadModelTest } from "../../../workspace/read-model/__fixtures__/test-layer.js";
import { emptyWorkspaceState, type WorkspaceState } from "../workspace-fixtures/interpret-ops.js";
import { scopeFilesFromWorkspaceState } from "../workspace-fixtures/fixture-state.js";
import { skillsLockfileAlignedRule } from "./skills-lockfile-aligned.js";

type RawResolvedExtensionMap = Record<
  string,
  { readonly version: string; readonly publisherBindingId: string }
>;

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
    return yield* skillsLockfileAlignedRule.check(context);
  });

const skillLockEntry = (args: {
  readonly owner: string;
  readonly name: string;
  readonly resolvedVersion: string;
  readonly retainedByPack?: boolean;
}) => ({
  type: "registry",
  owner: args.owner,
  name: args.name,
  resolvedVersion: args.resolvedVersion,
  integrity: "sha512-stub",
  sourceName: "default",

  publisherBindingId: "hbnd_test",
  installedAt: "2026-04-21T00:00:00.000Z",
  updatedAt: "2026-04-21T00:00:00.000Z",
  sourceHash: "sha",
  ...(args.retainedByPack === undefined ? {} : { retainedByPack: args.retainedByPack }),
});

const packLockEntry = (args: {
  readonly owner: string;
  readonly name: string;
  readonly resolvedSkills: RawResolvedExtensionMap;
}) => ({
  type: "registry",
  owner: args.owner,
  name: args.name,
  resolvedVersion: "1.0.0",
  integrity: "sha512-stub",
  sourceName: "default",

  publisherBindingId: "hbnd_test",
  installedAt: "2026-04-21T00:00:00.000Z",
  updatedAt: "2026-04-21T00:00:00.000Z",
  resolvedSkills: args.resolvedSkills,
  resolvedCommands: {},
  resolvedMcpServers: {},
  resolvedSubagents: {},
});

describe("workspace/skills-lockfile-aligned", () => {
  it.effect("does not report lockfile-only skills retained by an installed pack", () =>
    Effect.gen(function* () {
      const state = emptyWorkspaceState();
      state.settings = {
        agents: ["claude-code"],
        packs: { foo: "@examples/packs/foo@1.0.0" },
        skills: {},
      };
      state.lockfile = {
        lockfileVersion: 3,
        skills: {
          "foo-add-flag": skillLockEntry({
            owner: "@examples",
            name: "foo-add-flag",
            resolvedVersion: "0.1.0",
            retainedByPack: true,
          }),
        },
        packs: {
          foo: packLockEntry({
            owner: "@examples",
            name: "foo",
            resolvedSkills: {
              "@examples/skills/foo-add-flag": {
                version: "0.1.0",
                publisherBindingId: "hbnd_test",
              },
            },
          }),
        },
      };

      const findings = yield* runCheck(state);

      expect(findings).toEqual([]);
    }),
  );

  it.effect("still reports a genuine orphan skill lock entry", () =>
    Effect.gen(function* () {
      const state = emptyWorkspaceState();
      state.settings = {
        agents: ["claude-code"],
        skills: {},
      };
      state.lockfile = {
        lockfileVersion: 3,
        skills: {
          stale: skillLockEntry({
            owner: "@acme",
            name: "stale",
            resolvedVersion: "1.0.0",
          }),
        },
      };

      const findings = yield* runCheck(state);

      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toContain("listed in the lockfile but not in settings.skills");
    }),
  );

  it.effect("accepts locked registry versions that satisfy the declared range", () =>
    Effect.gen(function* () {
      const state = emptyWorkspaceState();
      state.settings = {
        agents: ["claude-code"],
        skills: { reviewer: "@acme/skills/reviewer@^0.1.0" },
      };
      state.lockfile = {
        lockfileVersion: 3,
        skills: {
          reviewer: skillLockEntry({
            owner: "@acme",
            name: "reviewer",
            resolvedVersion: "0.1.0",
          }),
        },
      };

      const findings = yield* runCheck(state);

      expect(findings).toEqual([]);
    }),
  );

  it.effect("reports locked registry versions that do not satisfy the declared range", () =>
    Effect.gen(function* () {
      const state = emptyWorkspaceState();
      state.settings = {
        agents: ["claude-code"],
        skills: { reviewer: "@acme/skills/reviewer@^0.1.0" },
      };
      state.lockfile = {
        lockfileVersion: 3,
        skills: {
          reviewer: skillLockEntry({
            owner: "@acme",
            name: "reviewer",
            resolvedVersion: "1.0.0",
          }),
        },
      };

      const findings = yield* runCheck(state);

      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toContain("versions do not match");
    }),
  );
});

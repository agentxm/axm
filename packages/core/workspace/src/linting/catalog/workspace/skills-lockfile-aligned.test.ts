import { describe, expect, it } from "@effect/vitest";
import { desiredConstraintOf } from "../../../desired-state/testing.js";
import * as Effect from "effect/Effect";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import { makeWorkspaceReadModel } from "../../../desired-state/index.js";
import { WorkspaceReadModelTest } from "../../../desired-state/testing.js";
import type { CanonicalObservation, DesiredExtensionNode } from "../../../desired-state/index.js";
import { emptyWorkspaceState, type WorkspaceState } from "../test-support/interpret-ops.js";
import { scopeFilesFromWorkspaceState } from "../test-support/fixture-state.js";
import { skillsLockfileAlignedRule } from "./skills-lockfile-aligned.js";

const treeIntegrity = `sha256-tree-v1:${"0".repeat(64)}`;

const desiredSkill = (
  source: string,
  constraints: ReadonlyArray<string> = [],
): DesiredExtensionNode => ({
  type: "skill",
  name: "reviewer",
  identity: "@acme/skills/reviewer",
  source,
  enabled: true,
  constraint: desiredConstraintOf(...constraints),
  origins: [{ type: "settings", source, enabled: true }],
});

const contextFor = (
  state: WorkspaceState,
  nodes: ReadonlyArray<DesiredExtensionNode>,
  observations: ReadonlyArray<CanonicalObservation>,
): Effect.Effect<WorkspaceRuleContext> => {
  const project = scopeFilesFromWorkspaceState(state);
  return Effect.gen(function* () {
    const workspace = yield* makeWorkspaceReadModel("project");
    return {
      subject: { root: "/tmp/ws", scope: "project" },
      workspace,
      axmDirExists: Effect.succeed(state.existingPaths.has(".axm")),
      health: {
        desiredState: Effect.succeed({
          complete: true,
          nodes,
          mcpSourceClosures: [],
          problems: [],
        }),
        canonicalObservations: Effect.succeed(
          observations.flatMap((observation) => {
            const desired = nodes.find(
              (node) => node.type === observation.type && node.name === observation.name,
            );
            return desired === undefined ? [] : [{ desired, observation }];
          }),
        ),
      },
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

const runCheck = (
  state: WorkspaceState,
  nodes: ReadonlyArray<DesiredExtensionNode> = [],
  observations: ReadonlyArray<CanonicalObservation> = [],
) =>
  Effect.gen(function* () {
    const context = yield* contextFor(state, nodes, observations);
    return yield* skillsLockfileAlignedRule.check(context);
  });

const registryResolution = (resolvedVersion: string) => ({
  source: { type: "registry", url: "https://registry.agentxm.ai" },
  identity: { owner: "@acme", name: "reviewer" },
  resolved: {
    version: resolvedVersion,
    integrity: "sha512-stub",
    publisherBindingId: "hbnd_test",
  },
  treeIntegrity,
});

describe("workspace/skills-lockfile-aligned", () => {
  it.effect("reports an orphan Git resolution without prescribing a command", () =>
    Effect.gen(function* () {
      const state = emptyWorkspaceState();
      state.settings = { agents: ["claude-code"], skills: {} };
      state.lockfile = {
        lockfileVersion: 8,
        skills: {
          review: {
            source: {
              type: "git",
              url: "https://github.com/acme/agent-extensions.git",
              path: ".agents/skills/review",
              revision: "v1",
            },
            identity: { owner: "@acme", name: "review" },
            resolved: { commit: "commit-v1", tree: "tree-v1" },
            treeIntegrity,
          },
        },
      };

      const findings = yield* runCheck(state);

      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toBe(
        "Skill 'review' has an accepted resolution but is not desired.",
      );
      expect(findings[0]?.message).not.toContain("axm ");
    }),
  );

  it.effect("reports the absent accepted resolution the canonical observation found", () =>
    Effect.gen(function* () {
      const source = "@acme/skills/reviewer@^0.1.0";
      const state = emptyWorkspaceState();
      state.settings = { agents: ["claude-code"], skills: { reviewer: source } };
      state.lockfile = { lockfileVersion: 8, skills: {} };

      const findings = yield* runCheck(
        state,
        [desiredSkill(source, ["^0.1.0"])],
        [{ type: "skill", name: "reviewer", status: "missing-resolution" }],
      );

      expect(findings.map(({ message }) => message)).toEqual([
        "skill '@acme/skills/reviewer' has no accepted resolution.",
      ]);
    }),
  );

  it.effect("leaves a constraint mismatch to the rule that reports the constraint fact", () =>
    Effect.gen(function* () {
      const source = "@acme/skills/reviewer@^0.1.0";
      const desired = desiredSkill(source, ["^0.1.0"]);
      const state = emptyWorkspaceState();
      state.settings = { agents: ["claude-code"], skills: { reviewer: source } };
      state.lockfile = {
        lockfileVersion: 8,
        skills: { reviewer: registryResolution("1.0.0") },
      };

      const findings = yield* runCheck(
        state,
        [desired],
        [
          {
            type: "skill",
            name: "reviewer",
            status: "constraint-mismatch",
            acceptedVersion: "1.0.0",
            authority: {
              source: "desired-state-graph",
              identity: desired.identity,
              locator: source,
              constraints: [{ source: "settings", range: "^0.1.0", location: "axm.json" }],
            },
          },
        ],
      );

      expect(findings).toEqual([]);
    }),
  );
});

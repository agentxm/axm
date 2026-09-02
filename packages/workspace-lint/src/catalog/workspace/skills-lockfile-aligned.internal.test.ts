import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import { makeWorkspaceReadModel } from "@agentxm/workspace-state";
import { WorkspaceReadModelTest } from "@agentxm/workspace-state/testing";
import type { DesiredExtensionNode } from "@agentxm/workspace-state";
import { emptyWorkspaceState, type WorkspaceState } from "../workspace-fixtures/interpret-ops.js";
import { scopeFilesFromWorkspaceState } from "../workspace-fixtures/fixture-state.js";
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
  constraints,
  origins: [{ type: "settings", source, enabled: true }],
});

const contextFor = (
  state: WorkspaceState,
  nodes: ReadonlyArray<DesiredExtensionNode>,
): Effect.Effect<WorkspaceRuleContext> => {
  const project = scopeFilesFromWorkspaceState(state);
  return Effect.gen(function* () {
    const workspace = yield* makeWorkspaceReadModel("project");
    return {
      subject: { root: "/tmp/ws", scope: "project" },
      workspace,
      axmDirExists: Effect.succeed(state.existingPaths.has(".axm")),
      health: {
        desiredState: Effect.succeed({ complete: true, nodes, problems: [] }),
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

const runCheck = (state: WorkspaceState, nodes: ReadonlyArray<DesiredExtensionNode> = []) =>
  Effect.gen(function* () {
    const context = yield* contextFor(state, nodes);
    return yield* skillsLockfileAlignedRule.check(context);
  });

const registryResolution = (resolvedVersion: string) => ({
  type: "registry",
  sourceType: "registry",
  sourceName: "agentxm",
  endpoint: "https://registry.agentxm.ai",
  extensionType: "skill",
  workspaceName: "reviewer",
  packageFormat: "agentxm",
  owner: "@acme",
  name: "reviewer",
  resolvedVersion,
  integrity: "sha512-stub",
  publisherBindingId: "hbnd_test",
  treeIntegrity,
});

describe("workspace/skills-lockfile-aligned", () => {
  it.effect("reports an orphan Git resolution without prescribing a command", () =>
    Effect.gen(function* () {
      const state = emptyWorkspaceState();
      state.settings = { agents: ["claude-code"], skills: {} };
      state.lockfile = {
        lockfileVersion: 6,
        skills: {
          review: {
            type: "github",
            sourceType: "github",
            sourceName: "github",
            endpoint: "https://github.com",
            extensionType: "skill",
            workspaceName: "review",
            packageFormat: "agentxm",
            packageOwner: "@acme",
            packageName: "review",
            owner: "acme",
            repo: "agent-extensions",
            path: ".agents/skills/review",
            ref: "v1",
            resolvedCommit: "commit-v1",
            resolvedTree: "tree-v1",
            contentIdentity: "content-v1",
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

  it.effect("reports a Registry resolution outside the desired constraint", () =>
    Effect.gen(function* () {
      const source = "@acme/skills/reviewer@^0.1.0";
      const state = emptyWorkspaceState();
      state.settings = { agents: ["claude-code"], skills: { reviewer: source } };
      state.lockfile = {
        lockfileVersion: 6,
        skills: { reviewer: registryResolution("1.0.0") },
      };

      const findings = yield* runCheck(state, [desiredSkill(source, ["^0.1.0"])]);

      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toContain("does not satisfy desired constraint");
    }),
  );
});

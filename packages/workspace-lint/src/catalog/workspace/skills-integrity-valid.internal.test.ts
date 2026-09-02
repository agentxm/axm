import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import { makeWorkspaceReadModel } from "@agentxm/workspace-state";
import { WorkspaceReadModelTest } from "@agentxm/workspace-state/testing";
import type { DesiredExtensionNode } from "@agentxm/workspace-state";
import { emptyWorkspaceState, type WorkspaceState } from "../workspace-fixtures/interpret-ops.js";
import { scopeFilesFromWorkspaceState } from "../workspace-fixtures/fixture-state.js";
import { skillsIntegrityValidRule } from "./skills-integrity-valid.js";

const treeIntegrity = `sha256-tree-v1:${"0".repeat(64)}`;

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
      health: { desiredState: Effect.succeed({ complete: true, nodes, problems: [] }) },
      displayRoot: "",
    } satisfies WorkspaceRuleContext;
  }).pipe(
    Effect.provide(
      WorkspaceReadModelTest({ workspaceRoot: "/tmp/ws", userHome: "/tmp/user", project }),
    ),
    Effect.orDie,
  );
};

const runCheck = (state: WorkspaceState, nodes: ReadonlyArray<DesiredExtensionNode>) =>
  Effect.gen(function* () {
    const context = yield* contextFor(state, nodes);
    return yield* skillsIntegrityValidRule.check(context);
  });

const resolution = {
  type: "registry",
  sourceType: "registry",
  sourceName: "agentxm",
  endpoint: "https://registry.agentxm.ai",
  extensionType: "skill",
  workspaceName: "my-skill",
  packageFormat: "agentxm",
  owner: "@examples",
  name: "my-skill",
  resolvedVersion: "1.0.0",
  integrity: "sha512-stub",
  publisherBindingId: "hbnd_test",
  treeIntegrity,
};

const stateWithDesiredSkill = () => {
  const state = emptyWorkspaceState();
  state.settings = {
    agents: ["claude-code"],
    skills: { "my-skill": { source: "@examples/skills/my-skill@1.0.0" } },
  };
  state.lockfile = { lockfileVersion: 6, skills: { "my-skill": resolution } };
  return state;
};

describe("workspace/skills-integrity-valid", () => {
  it.effect("does not treat a lock-only resolution as desired installed content", () =>
    Effect.gen(function* () {
      const state = stateWithDesiredSkill();
      state.settings = { agents: ["claude-code"], skills: {} };

      expect(yield* runCheck(state, [])).toEqual([]);
    }),
  );
});

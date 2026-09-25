import { describe, expect, it } from "@effect/vitest";
import { desiredConstraintOf } from "../../../desired-state/testing.js";
import * as Effect from "effect/Effect";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import { makeWorkspaceReadModel } from "../../../desired-state/index.js";
import { WorkspaceReadModelTest } from "../../../desired-state/testing.js";
import type { CanonicalObservation, DesiredExtensionNode } from "../../../desired-state/index.js";
import { emptyWorkspaceState, type WorkspaceState } from "../test-support/interpret-ops.js";
import { scopeFilesFromWorkspaceState } from "../test-support/fixture-state.js";
import { skillsIntegrityValidRule } from "./skills-integrity-valid.js";

const treeIntegrity = `sha256-tree-v1:${"0".repeat(64)}`;

const contextFor = (
  state: WorkspaceState,
  nodes: ReadonlyArray<DesiredExtensionNode>,
  observations?: ReadonlyArray<{
    readonly desired: DesiredExtensionNode;
    readonly observation: CanonicalObservation;
  }>,
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
        ...(observations === undefined
          ? {}
          : { canonicalObservations: Effect.succeed(observations) }),
      },
      displayRoot: "",
    } satisfies WorkspaceRuleContext;
  }).pipe(
    Effect.provide(
      WorkspaceReadModelTest({ workspaceRoot: "/tmp/ws", userHome: "/tmp/user", project }),
    ),
    Effect.orDie,
  );
};

const runCheck = (
  state: WorkspaceState,
  nodes: ReadonlyArray<DesiredExtensionNode>,
  observations?: Parameters<typeof contextFor>[2],
) =>
  Effect.gen(function* () {
    const context = yield* contextFor(state, nodes, observations);
    return yield* skillsIntegrityValidRule.check(context);
  });

const resolution = {
  source: { type: "registry", url: "https://registry.agentxm.ai" },
  identity: { owner: "@examples", name: "my-skill" },
  resolved: {
    version: "1.0.0",
    integrity: "sha512-stub",
    publisherBindingId: "hbnd_test",
  },
  treeIntegrity,
};

const stateWithDesiredSkill = () => {
  const state = emptyWorkspaceState();
  state.settings = {
    agents: ["claude-code"],
    skills: { "my-skill": { source: "@examples/skills/my-skill@1.0.0" } },
  };
  state.lockfile = { lockfileVersion: 8, skills: { "my-skill": resolution } };
  return state;
};

const desiredSkill = {
  type: "skill",
  name: "my-skill",
  identity: {
    authority: "registry",
    fqn: "@examples/skills/my-skill",
    registry: { sourceName: undefined, endpoint: undefined },
  },
  source: "@examples/skills/my-skill@1.0.0",
  enabled: true,
  constraint: desiredConstraintOf("1.0.0"),
  origins: [
    {
      type: "settings",
      localName: "my-skill",
      authority: "sourced",
      source: "@examples/skills/my-skill@1.0.0",
      enabled: true,
      constraint: "1.0.0",
    },
  ],
} satisfies DesiredExtensionNode;

describe("workspace/skills-integrity-valid", () => {
  it.effect("reports an accepted skill whose package is absent when nothing observed it", () =>
    Effect.gen(function* () {
      expect(yield* runCheck(stateWithDesiredSkill(), [desiredSkill])).toEqual([
        expect.objectContaining({
          message:
            "Skill 'my-skill' has an accepted resolution, but its installed source directory is missing.",
        }),
      ]);
    }),
  );

  it.effect("keeps reporting an absent package when the observation is not absent content", () =>
    Effect.gen(function* () {
      const findings = yield* runCheck(
        stateWithDesiredSkill(),
        [desiredSkill],
        [
          {
            desired: desiredSkill,
            observation: {
              type: "skill",
              name: "my-skill",
              status: "incomplete",
              path: "/tmp/ws/agent_extensions/registry/@examples/skills/my-skill",
            },
          },
        ],
      );

      expect(findings).toHaveLength(1);
    }),
  );

  it.effect("defers to the missing observation that states the absent package once", () =>
    Effect.gen(function* () {
      const findings = yield* runCheck(
        stateWithDesiredSkill(),
        [desiredSkill],
        [
          {
            desired: desiredSkill,
            observation: {
              type: "skill",
              name: "my-skill",
              status: "missing",
              path: "/tmp/ws/agent_extensions/registry/@examples/skills/my-skill",
            },
          },
        ],
      );

      expect(findings).toEqual([]);
    }),
  );

  it.effect("does not treat a lock-only resolution as desired installed content", () =>
    Effect.gen(function* () {
      const state = stateWithDesiredSkill();
      state.settings = { agents: ["claude-code"], skills: {} };

      expect(yield* runCheck(state, [])).toEqual([]);
    }),
  );
});

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { WorkspaceRuleContext } from "../../context.js";
import { makeWorkspaceReadModel } from "../../../workspace/read-model/service.js";
import { WorkspaceReadModelTest } from "../../../workspace/read-model/__fixtures__/test-layer.js";
import type { DesiredExtensionNode } from "../../../workspace/desired-state-graph.js";
import { emptyWorkspaceState, type WorkspaceState } from "../workspace-fixtures/interpret-ops.js";
import { scopeFilesFromWorkspaceState } from "../workspace-fixtures/fixture-state.js";
import { skillsIntegrityValidRule } from "./skills-integrity-valid.js";

const desired: DesiredExtensionNode = {
  type: "skill",
  name: "my-skill",
  identity: "@examples/skills/my-skill",
  source: "@examples/skills/my-skill@1.0.0",
  enabled: true,
  constraints: ["1.0.0"],
  origins: [
    {
      type: "settings",
      source: "@examples/skills/my-skill@1.0.0",
      enabled: true,
    },
  ],
};

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
  owner: "@examples",
  name: "my-skill",
  resolvedVersion: "1.0.0",
  integrity: "sha512-stub",
  sourceName: "default",
  publisherBindingId: "hbnd_test",
};

const stateWithDesiredSkill = () => {
  const state = emptyWorkspaceState();
  state.settings = {
    agents: ["claude-code"],
    skills: { "my-skill": { source: "@examples/skills/my-skill@1.0.0" } },
  };
  state.lockfile = { lockfileVersion: 4, skills: { "my-skill": resolution } };
  return state;
};

describe("workspace/skills-integrity-valid", () => {
  it.effect("accepts present canonical content for a desired accepted resolution", () =>
    Effect.gen(function* () {
      const state = stateWithDesiredSkill();
      state.existingPaths.add(".axm/extensions/@examples/skills/my-skill/src/SKILL.md");

      expect(yield* runCheck(state, [desired])).toEqual([]);
    }),
  );

  it.effect("reports missing canonical content as a fact-only advisory", () =>
    Effect.gen(function* () {
      const findings = yield* runCheck(stateWithDesiredSkill(), [desired]);

      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ kind: "advisory", severity: "error" });
      expect(findings[0]?.message).toContain("its installed source directory is missing");
    }),
  );

  it.effect("does not treat a lock-only resolution as desired installed content", () =>
    Effect.gen(function* () {
      const state = stateWithDesiredSkill();
      state.settings = { agents: ["claude-code"], skills: {} };

      expect(yield* runCheck(state, [])).toEqual([]);
    }),
  );

  it.effect("does not require a lock row for workspace-authored desired content", () =>
    Effect.gen(function* () {
      const state = emptyWorkspaceState();
      state.settings = {
        agents: ["claude-code"],
        skills: { draft: "workspace:@examples/skills/draft" },
      };
      state.lockfile = { lockfileVersion: 4, skills: {} };

      expect(yield* runCheck(state, [])).toEqual([]);
    }),
  );
});

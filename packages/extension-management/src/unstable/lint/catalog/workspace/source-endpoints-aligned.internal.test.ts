import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import { makeWorkspaceReadModel } from "@agentxm/workspace-state";
import { WorkspaceReadModelTest } from "@agentxm/workspace-state/testing";
import { emptyWorkspaceState, type WorkspaceState } from "../workspace-fixtures/interpret-ops.js";
import { scopeFilesFromWorkspaceState } from "../workspace-fixtures/fixture-state.js";
import { sourceEndpointsAlignedRule } from "./source-endpoints-aligned.js";

const treeIntegrity = `sha256-tree-v1:${"0".repeat(64)}`;

const contextFor = (state: WorkspaceState): Effect.Effect<WorkspaceRuleContext> => {
  const project = scopeFilesFromWorkspaceState(state);
  return Effect.gen(function* () {
    const workspace = yield* makeWorkspaceReadModel("project");
    return {
      subject: { root: "/tmp/ws", scope: "project" },
      workspace,
      axmDirExists: Effect.succeed(true),
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

const stateWithGitHubEndpoint = (configuredEndpoint: string): WorkspaceState => {
  const state = emptyWorkspaceState();
  state.settings = {
    agents: ["claude-code"],
    sources: [{ name: "github", type: "github", url: configuredEndpoint }],
    skills: {
      "react-router": "github:remix-run/react-router//.agents/skills/react-router@main",
    },
  };
  state.lockfile = {
    lockfileVersion: 6,
    skills: {
      "react-router": {
        type: "github",
        sourceType: "github",
        sourceName: "github",
        endpoint: "https://github.com",
        extensionType: "skill",
        workspaceName: "react-router",
        packageFormat: "agent-skill",
        packageName: "react-router",
        owner: "remix-run",
        repo: "react-router",
        path: ".agents/skills/react-router",
        ref: "main",
        resolvedCommit: "commit",
        resolvedTree: "tree",
        contentIdentity: "content",
        treeIntegrity,
      },
    },
  };
  return state;
};

describe("workspace/source-endpoints-aligned", () => {
  it.effect("accepts the configured endpoint recorded by the lock", () =>
    Effect.gen(function* () {
      const context = yield* contextFor(stateWithGitHubEndpoint("https://github.com"));
      expect(yield* sourceEndpointsAlignedRule.check(context)).toEqual([]);
    }),
  );

  it.effect("blocks a same-name endpoint change until an explicit transition", () =>
    Effect.gen(function* () {
      const context = yield* contextFor(stateWithGitHubEndpoint("https://github.example.test"));
      const findings = yield* sourceEndpointsAlignedRule.check(context);

      expect(findings).toHaveLength(1);
      expect(findings[0]?.severity).toBe("error");
      expect(findings[0]?.message).toContain("source 'github'");
      expect(findings[0]?.message).toContain("explicit source transition");
      expect(findings[0]?.location?.file).toBe("axm.json");
    }),
  );
});

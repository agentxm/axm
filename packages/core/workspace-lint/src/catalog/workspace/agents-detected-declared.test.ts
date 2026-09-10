import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type { AgentId } from "@agentxm/extension-model/unstable/agents/types";
import { AgentPresenceUnavailable, type AgentPresenceProbeService } from "@agentxm/workspace-state";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import {
  runScenario,
  SCENARIO_USER_HOME,
  SCENARIO_WORKSPACE_ROOT,
} from "@agentxm/workspace-state/testing";
import { detectAgentsForScope } from "@agentxm/agent-integration";
import { agentsDetectedDeclaredRule } from "./agents-detected-declared.js";

// The fixture layer detects no agents by default; these scenarios assert
// detection-driven presence, so they inject the real structured detection
// over the fixture filesystem.
const detectionProbe = (fs: FileSystem.FileSystem, path: Path.Path): AgentPresenceProbeService => ({
  detect: (root, scope) =>
    detectAgentsForScope(root, scope).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.map((detected) => new Set<AgentId>(detected.map((agent) => agent.id))),
      Effect.mapError((error) => new AgentPresenceUnavailable({ message: error.message })),
    ),
});

const contextFor = (workspace: WorkspaceRuleContext["workspace"]): WorkspaceRuleContext => ({
  workspace,
  subject: { root: SCENARIO_WORKSPACE_ROOT, scope: "project" },
  axmDirExists: Effect.succeed(true),
  displayRoot: "",
});

describe("workspace/agents-detected-declared", () => {
  it.effect("does not infer any reader from a populated shared MCP file", () =>
    runScenario(
      {
        workspaceRoot: SCENARIO_WORKSPACE_ROOT,
        userHome: SCENARIO_USER_HOME,
        project: {
          settings: { _tag: "valid", contents: { agents: [] } },
          mcpJson: {
            _tag: "valid",
            contents: { mcpServers: { linear: { command: "linear-mcp" } } },
          },
        },
      },
      (ctx) =>
        Effect.gen(function* () {
          const project = ctx.scope("project");
          const findings = yield* agentsDetectedDeclaredRule.check(contextFor(project));
          const detected = yield* project.agents.detected;

          expect(findings).toEqual([]);
          expect(detected.filter((row) => row.present).map((row) => row.agentId)).toEqual([]);
        }),
      { probe: detectionProbe },
    ),
  );

  it.effect("keeps an undeclared agent-native MCP target as presence evidence", () =>
    runScenario(
      {
        workspaceRoot: SCENARIO_WORKSPACE_ROOT,
        userHome: SCENARIO_USER_HOME,
        project: {
          settings: { _tag: "valid", contents: { agents: [] } },
          agentDirs: {
            cursor: {
              "mcp.json": JSON.stringify({
                mcpServers: { linear: { command: "linear-mcp" } },
              }),
            },
          },
        },
      },
      (ctx) =>
        Effect.gen(function* () {
          const project = ctx.scope("project");
          const findings = yield* agentsDetectedDeclaredRule.check(contextFor(project));
          const readModelPresence = (yield* project.agents.detected).filter((row) => row.present);

          expect(findings).toHaveLength(1);
          expect(findings[0]?.message).toBe(
            "Agent 'cursor' is present on disk but missing from `settings.agents[]`.",
          );
          expect(readModelPresence.map((row) => row.agentId)).toEqual(["cursor"]);
        }),
      { probe: detectionProbe },
    ),
  );
});

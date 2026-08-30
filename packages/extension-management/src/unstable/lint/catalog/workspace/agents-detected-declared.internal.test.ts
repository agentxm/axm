import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import {
  runScenario,
  SCENARIO_USER_HOME,
  SCENARIO_WORKSPACE_ROOT,
} from "../../../workspace/read-model/__tests__/scenarios/_harness.js";
import { agentsDetectedDeclaredRule } from "./agents-detected-declared.js";

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
    ),
  );
});

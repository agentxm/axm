import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { WorkspaceRuleContext } from "../../context.js";
import { mcpServerAgentOrphanedRule } from "./mcp-server-agent-orphaned.js";

const makeContext = (): WorkspaceRuleContext =>
  // Assertion needed: this rule only reads the MCP server unmanaged cell.
  ({
    workspace: {
      mcpServers: {
        unmanaged: Effect.succeed([
          {
            key: { scope: "project", type: "mcp-server", name: "demo" },
            actual: {
              key: { scope: "project", type: "mcp-server", name: "demo" },
              origin: { _tag: "agent-mcp-config", agentId: "claude-code" },
              contentRoot: null,
              configFile: ".mcp.json",
              config: {
                managedBy: "axm",
                type: "stdio",
                command: "node",
              },
            },
          },
          {
            key: { scope: "project", type: "mcp-server", name: "manual" },
            actual: {
              key: { scope: "project", type: "mcp-server", name: "manual" },
              origin: { _tag: "agent-mcp-config", agentId: "claude-code" },
              contentRoot: null,
              configFile: ".mcp.json",
              config: {
                type: "stdio",
                command: "node",
              },
            },
          },
        ]),
      },
      state: {
        settings: Effect.succeed(Option.some({ agents: ["claude-code"] })),
      },
    },
    subject: { root: "/tmp/project", scope: "project" },
    axmDirExists: Effect.succeed(true),
    displayRoot: "",
  }) as unknown as WorkspaceRuleContext;

describe("workspace/mcp-server-agent-orphaned", () => {
  it.effect("reports and fixes managed agent MCP entries not declared in settings", () =>
    Effect.gen(function* () {
      const findings = yield* mcpServerAgentOrphanedRule.check(makeContext());

      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("workspace/mcp-server-agent-orphaned");
      expect(findings[0]?.kind).toBe("autofixable");
      expect(findings[0]?.location).toEqual({ file: ".mcp.json" });
      const finding = findings[0];
      if (finding === undefined || finding.kind !== "autofixable") {
        throw new Error("Expected an autofixable orphan finding");
      }
      const operations = yield* mcpServerAgentOrphanedRule.fix(makeContext(), finding);
      expect(operations).toEqual([
        {
          name: "remove-mcp-server-agent",
          args: {
            serverName: "demo",
            agentId: "claude-code",
            scope: "project",
          },
        },
      ]);
    }),
  );
});

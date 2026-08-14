import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { WorkspaceRuleContext } from "../../context.js";
import { mcpServerAgentOrphanedRule } from "./mcps-agent-orphaned.js";

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
                "x-axm": { managed: true, source: "inline" },
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

describe("workspace/mcps-agent-orphaned", () => {
  it.effect("reports owned MCP entries not declared in settings without mutating", () =>
    Effect.gen(function* () {
      const findings = yield* mcpServerAgentOrphanedRule.check(makeContext());

      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("workspace/mcps-agent-orphaned");
      expect(findings[0]?.kind).toBe("advisory");
      expect(findings[0]?.location).toEqual({ file: ".mcp.json" });
      expect("fix" in mcpServerAgentOrphanedRule).toBe(false);
    }),
  );
});

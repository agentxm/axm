import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { WorkspaceRuleContext } from "../../context.js";
import { mcpServerAgentDriftRule } from "./mcp-server-agent-drift.js";

const makeContext = (): WorkspaceRuleContext =>
  // Assertion needed: this rule only reads the MCP server installed cell.
  ({
    workspace: {
      mcpServers: {
        installed: Effect.succeed([
          {
            key: { scope: "project", type: "mcp-server", name: "demo" },
            activation: "enabled",
            installationOrigin: {
              _tag: "direct",
              declared: {
                name: "demo",
                entry: {
                  source: "inline",
                  enabled: true,
                  command: "node",
                  args: ["server.js"],
                  env: {},
                },
              },
            },
            actual: [
              {
                key: { scope: "project", type: "mcp-server", name: "demo" },
                origin: { _tag: "agent-mcp-config", agentId: "claude-code" },
                contentRoot: null,
                configFile: ".mcp.json",
                config: {
                  managedBy: "axm",
                  type: "stdio",
                  command: "python",
                },
              },
            ],
            providingPacks: [],
          },
        ]),
      },
    },
    subject: { root: "/tmp/project", scope: "project" },
    axmDirExists: Effect.succeed(true),
    displayRoot: "",
  }) as unknown as WorkspaceRuleContext;

describe("workspace/mcp-server-agent-drift", () => {
  it.effect("reports managed agent MCP entries that differ from AXM projection", () =>
    Effect.gen(function* () {
      const findings = yield* mcpServerAgentDriftRule.check(makeContext());

      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("workspace/mcp-server-agent-drift");
      expect(findings[0]?.message).toContain("axm sync --force");
    }),
  );
});

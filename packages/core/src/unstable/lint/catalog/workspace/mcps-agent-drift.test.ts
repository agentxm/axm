import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { WorkspaceRuleContext } from "../../context.js";
import { mcpServerAgentDriftRule } from "./mcps-agent-drift.js";

const makeContext = (
  args: {
    readonly activation?: "enabled" | "disabled";
    readonly agentIds?: ReadonlyArray<string>;
    readonly actualAgentId?: string;
    readonly actualConfig?: Readonly<Record<string, unknown>>;
  } = {},
): WorkspaceRuleContext =>
  // Assertion needed: this rule only reads the MCP server installed cell.
  ({
    workspace: {
      mcpServers: {
        installed: Effect.succeed([
          {
            key: { scope: "project", type: "mcp-server", name: "demo" },
            activation: args.activation ?? "enabled",
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
                origin: {
                  _tag: "agent-mcp-config",
                  agentId: args.actualAgentId ?? "claude-code",
                },
                contentRoot: null,
                configFile: ".mcp.json",
                config:
                  args.actualConfig ??
                  ({
                    "x-axm": { managed: true, source: "inline" },
                    type: "stdio",
                    command: "python",
                  } satisfies Readonly<Record<string, unknown>>),
              },
            ],
            providingPacks: [],
          },
        ]),
      },
      state: {
        settings: Effect.succeed(Option.some({ agents: args.agentIds ?? ["claude-code"] })),
      },
    },
    subject: { root: "/tmp/project", scope: "project" },
    axmDirExists: Effect.succeed(true),
    displayRoot: "",
  }) as unknown as WorkspaceRuleContext;

describe("workspace/mcps-agent-drift", () => {
  it.effect("reports managed agent MCP entries that differ from AXM projection", () =>
    Effect.gen(function* () {
      const findings = yield* mcpServerAgentDriftRule.check(makeContext());

      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("workspace/mcps-agent-drift");
      expect(findings[0]?.kind).toBe("advisory");
      expect(findings[0]?.message).not.toContain("axm lint --fix");
      expect("fix" in mcpServerAgentDriftRule).toBe(false);
    }),
  );

  it.effect("reports a Copilot projection that another shared-file reader rejects", () =>
    Effect.gen(function* () {
      const findings = yield* mcpServerAgentDriftRule.check(
        makeContext({
          agentIds: ["claude-code", "github-copilot-cli"],
          actualAgentId: "github-copilot-cli",
          actualConfig: {
            "x-axm": { managed: true, source: "inline" },
            type: "local",
            command: "node",
            args: ["server.js"],
          },
        }),
      );

      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toContain("github-copilot-cli");
      expect(findings[0]?.message).toContain("type");
    }),
  );

  it.effect("reports drift for disabled MCP rows", () =>
    Effect.gen(function* () {
      const findings = yield* mcpServerAgentDriftRule.check(
        makeContext({ activation: "disabled" }),
      );

      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("workspace/mcps-agent-drift");
    }),
  );

  it.effect("renders an absolute config path relative to the workspace root", () =>
    Effect.gen(function* () {
      const context = makeContext();
      const installed = yield* context.workspace.mcpServers.installed;
      const row = installed[0];
      if (row === undefined) throw new Error("Expected installed MCP row");
      const findings = yield* mcpServerAgentDriftRule.check({
        ...context,
        workspace: {
          ...context.workspace,
          mcpServers: {
            ...context.workspace.mcpServers,
            installed: Effect.succeed([
              {
                ...row,
                actual: row.actual.map((actual) => ({
                  ...actual,
                  configFile: "/tmp/project/.mcp.json",
                })),
              },
            ]),
          },
        },
      });

      expect(findings[0]?.location).toEqual({ file: ".mcp.json" });
    }),
  );
});

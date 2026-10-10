import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { ConfigurableAgentId } from "@agentxm/extension-model/unstable/agent-capabilities";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions/common";
import type {
  ActualMcpServer,
  InstalledMcpServer,
  McpServerEntry,
} from "@agentxm/workspace-kernel/workspace-state";
import type { WorkspaceRuleContext } from "../../../../workspace-context.js";
import { mcpServerAgentDriftRule } from "../../mcps-agent-drift.js";
import {
  contextFor,
  validLockfile,
  validSettings,
  type WorkspaceRuleConformanceCase,
} from "../test-helpers.js";

const demoName = decodeExtensionNameSync("demo");
const demoKey = { scope: "project", type: "mcp-server", name: demoName } as const;
const inlineDemo = {
  kind: "inline",
  connection: { transport: "stdio", command: "node", args: ["server.js"], env: {} },
  enabled: true,
} satisfies McpServerEntry;

const managedDemoConfig = (command: string): Readonly<Record<string, unknown>> => ({
  type: "stdio",
  command,
  args: ["server.js"],
});

const installedDemo = (args: {
  readonly activation?: "enabled" | "disabled";
  readonly actual: ActualMcpServer;
}): InstalledMcpServer => ({
  key: demoKey,
  installationOrigin: {
    _tag: "direct",
    declared: { name: demoName, entry: inlineDemo },
  },
  activation: args.activation ?? "enabled",
  resolved: Option.none(),
  actual: [args.actual],
});

export const mcpAgentDriftContext = (
  args: {
    readonly activation?: "enabled" | "disabled";
    readonly agentIds?: ReadonlyArray<ConfigurableAgentId>;
    readonly actualAgentId?: ConfigurableAgentId;
    readonly actualConfig?: Readonly<Record<string, unknown>>;
    readonly shared?: boolean;
  } = {},
): Effect.Effect<WorkspaceRuleContext> =>
  contextFor({
    settings: validSettings({
      agents: args.agentIds ?? ["cursor"],
      mcpServers: {
        demo: { connection: { transport: "stdio", command: "node", args: ["server.js"] } },
      },
    }),
    lockfile: validLockfile,
  }).pipe(
    Effect.map(
      (context) =>
        ({
          ...context,
          workspace: {
            ...context.workspace,
            mcpServers: {
              ...context.workspace.mcpServers,
              installed: Effect.succeed([
                installedDemo({
                  ...(args.activation === undefined ? {} : { activation: args.activation }),
                  actual: {
                    key: demoKey,
                    origin: args.shared
                      ? { _tag: "workspace-mcp-config" }
                      : {
                          _tag: "agent-mcp-config",
                          agentId: args.actualAgentId ?? "cursor",
                        },
                    contentRoot: null,
                    packageRoot: null,
                    configFile: args.shared ? ".mcp.json" : "/workspace/.cursor/mcp.json",
                    config: args.actualConfig ?? managedDemoConfig("python"),
                  },
                }),
              ]),
            },
          },
        }) satisfies WorkspaceRuleContext,
    ),
  );

export const mcpAgentDriftConformance: WorkspaceRuleConformanceCase = {
  rule: mcpServerAgentDriftRule,
  satisfied: () => mcpAgentDriftContext({ actualConfig: managedDemoConfig("node") }),
  violated: () => mcpAgentDriftContext(),
  expectedFindings: [
    {
      message: "MCP server 'demo' has drifted agent config for cursor (command).",
      location: { file: ".cursor/mcp.json" },
    },
  ],
  inapplicable: () =>
    contextFor({
      settings: validSettings({ agents: ["cursor"] }),
      lockfile: validLockfile,
    }),
};

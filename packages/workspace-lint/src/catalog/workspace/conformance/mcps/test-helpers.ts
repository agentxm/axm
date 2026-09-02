import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { ConfigurableAgentId } from "@agentxm/extension-model/unstable/agent-capabilities";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions/common";
import type {
  ActualMcpServer,
  InstalledMcpServer,
  McpServerEntry,
  UnmanagedMcpServer,
} from "@agentxm/workspace-state";
import type { WorkspaceRuleContext } from "../../../../workspace-context.js";
import { mcpServerAgentDriftRule } from "../../mcps-agent-drift.js";
import { mcpServerAgentOrphanedRule } from "../../mcps-agent-orphaned.js";
import { mcpServerSharedTargetCompatibleRule } from "../../mcps-shared-target-compatible.js";
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
  command: "node",
  args: ["server.js"],
  enabled: true,
  env: {},
} satisfies McpServerEntry;

const sharedTargetContext = (agents?: ReadonlyArray<"claude-code" | "github-copilot-cli">) =>
  contextFor({
    settings: validSettings({
      agents: ["claude-code", "github-copilot-cli"],
      mcpServers:
        agents === undefined
          ? { demo: { command: "node", args: ["server.js"] } }
          : { demo: { command: "node", args: ["server.js"], agents } },
    }),
    lockfile: validLockfile,
  });

export const mcpSharedTargetCompatibleConformance: WorkspaceRuleConformanceCase = {
  rule: mcpServerSharedTargetCompatibleRule,
  satisfied: () => sharedTargetContext(),
  violated: () => sharedTargetContext(["claude-code"]),
  expectedFindings: [
    {
      message:
        "MCP server 'demo' projects a value that another configured agent rejects in shared target '.mcp.json'. MCP target policy cannot be represented; targeted agents claude-code share it with untargeted agents github-copilot-cli. Update the configured agents or their MCP compatibility metadata before syncing.",
      location: { file: "axm.json" },
    },
  ],
  inapplicable: () => contextFor({ settings: validSettings(), lockfile: validLockfile }),
};

const managedDemoConfig = (command: string): Readonly<Record<string, unknown>> => ({
  "x-axm": {
    v: 1,
    managed: true,
    ext: "@workspace/mcps/demo",
    source: "inline",
  },
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
  providingPacks: [],
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
      mcpServers: { demo: { command: "node", args: ["server.js"] } },
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

const actualSharedDemo = (managed: boolean): ActualMcpServer => ({
  key: demoKey,
  origin: { _tag: "workspace-mcp-config" },
  contentRoot: null,
  packageRoot: null,
  configFile: ".mcp.json",
  config: managed ? managedDemoConfig("node") : { type: "stdio", command: "node" },
});

const unmanagedSharedDemo = (managed: boolean): UnmanagedMcpServer => ({
  key: demoKey,
  actual: actualSharedDemo(managed),
});

const orphanContext = (managed?: boolean) =>
  contextFor({
    settings: validSettings({ agents: ["claude-code"] }),
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
              unmanaged: Effect.succeed(
                managed === undefined ? [] : [unmanagedSharedDemo(managed)],
              ),
            },
          },
        }) satisfies WorkspaceRuleContext,
    ),
  );

export const mcpAgentOrphanedConformance: WorkspaceRuleConformanceCase = {
  rule: mcpServerAgentOrphanedRule,
  satisfied: () => orphanContext(),
  violated: () => orphanContext(true),
  expectedFindings: [
    {
      message: "MCP server 'demo' has an orphaned AXM-owned shared config.",
      location: { file: ".mcp.json" },
    },
  ],
  inapplicable: () => orphanContext(false),
};

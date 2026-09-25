import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import {
  isAxmManagedMcpEntry,
  planMcpServerTargets,
} from "../../../projection/agent-adapters/index.js";
import { diffAgentEntry } from "../../../projection/index.js";
import type { McpServerEntry } from "../../../desired-state/index.js";
import type { ActualMcpServer, InstalledMcpServer } from "../../../desired-state/index.js";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryFinding, AdvisoryRule, LintFinding } from "@agentxm/extension-content/lint";
import { desiredPackMemberBindings } from "./helpers/pack-members.js";

const RULE_ID = "workspace/mcps-agent-drift";

const relativeToRoot = (root: string, file: string): string => {
  if (file === root) return "";
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
};

const isInlineEntry = (entry: McpServerEntry): boolean =>
  entry.command !== undefined || entry.url !== undefined;

const configuredEntry = (row: InstalledMcpServer): McpServerEntry | undefined =>
  row.installationOrigin._tag === "direct" ? row.installationOrigin.declared.entry : undefined;

const managedConfigActuals = (
  actuals: ReadonlyArray<ActualMcpServer>,
): ReadonlyArray<ActualMcpServer> =>
  actuals.filter(
    (actual) =>
      (actual.origin._tag === "agent-mcp-config" ||
        actual.origin._tag === "workspace-mcp-config") &&
      actual.config !== null &&
      isAxmManagedMcpEntry(actual.config),
  );

const configuredAgentIds = (context: WorkspaceRuleContext): Effect.Effect<ReadonlySet<string>> =>
  Effect.gen(function* () {
    const settings = yield* Effect.result(context.workspace.state.settings);
    if (Result.isFailure(settings) || Option.isNone(settings.success)) {
      return new Set<string>();
    }
    return new Set(settings.success.value.agents ?? []);
  });

const findingFor = (args: {
  readonly name: string;
  readonly actual: ActualMcpServer;
  readonly fields: ReadonlyArray<string>;
  readonly consumers: ReadonlyArray<string>;
  readonly root: string;
}): AdvisoryFinding => {
  const finding = {
    kind: "advisory",
    ruleId: RULE_ID,
    severity: "warning",
    message:
      `MCP server '${args.name}' has drifted ${args.actual.origin._tag === "agent-mcp-config" ? `agent config for ${args.actual.origin.agentId}` : `shared config for ${args.consumers.join(", ")}`} ` +
      `(${args.fields.join(", ")}).`,
  } satisfies Omit<AdvisoryFinding, "location">;
  return args.actual.configFile === null
    ? finding
    : { ...finding, location: { file: relativeToRoot(args.root, args.actual.configFile) } };
};

interface DriftedAgentConfig {
  readonly row: InstalledMcpServer;
  readonly actual: ActualMcpServer;
  readonly fields: ReadonlyArray<string>;
  readonly consumers: ReadonlyArray<string>;
}

const configFileMatchesTarget = (configFile: string, targetPath: string): boolean =>
  configFile === targetPath ||
  configFile.endsWith(`/${targetPath}`) ||
  (targetPath.startsWith("~/") && configFile.endsWith(`/${targetPath.slice(2)}`));

/**
 * The entry the target plan renders for the file this actual entry lives in,
 * compared by decoded value: the same plan the writer and the inspector use.
 */
const checkActual = (args: {
  readonly row: InstalledMcpServer;
  readonly entry: McpServerEntry;
  readonly actual: ActualMcpServer;
  readonly configuredAgents: ReadonlySet<string>;
}): DriftedAgentConfig | undefined => {
  if (args.actual.config === null || args.actual.configFile === null) return undefined;
  const configFile = args.actual.configFile;
  const plan = planMcpServerTargets({
    agentIds: [...args.configuredAgents],
    scope: args.row.key.scope,
    serverName: args.row.key.name,
    declaration: args.entry,
    values: args.entry.env,
    enabled: args.entry.enabled ?? true,
  });
  if (plan._tag === "invalid") return undefined;
  const agentId =
    args.actual.origin._tag === "agent-mcp-config" ? args.actual.origin.agentId : undefined;
  const write = plan.writes.find(
    (candidate) =>
      configFileMatchesTarget(configFile, candidate.target.path) &&
      (agentId !== undefined
        ? candidate.agentIds.includes(agentId)
        : candidate.target.attribution === "shared"),
  );
  if (write === undefined) return undefined;
  const drift = diffAgentEntry(
    { _tag: "projected", entry: write.entry, warnings: [] },
    args.actual.config,
  );
  return drift._tag === "drift"
    ? { row: args.row, actual: args.actual, fields: drift.fields, consumers: write.agentIds }
    : undefined;
};

const driftedAgentConfigs = (
  rows: ReadonlyArray<InstalledMcpServer>,
  configuredAgents: ReadonlySet<string>,
): ReadonlyArray<DriftedAgentConfig> =>
  rows.flatMap((row) => {
    const entry = configuredEntry(row);
    if (entry === undefined || !isInlineEntry(entry)) return [];
    return managedConfigActuals(row.actual).flatMap((actual) => {
      if (
        actual.origin._tag === "agent-mcp-config" &&
        !configuredAgents.has(actual.origin.agentId)
      ) {
        return [];
      }
      const drift = checkActual({ row, entry, actual, configuredAgents });
      return drift === undefined ? [] : [drift];
    });
  });

const findingsForRows = (
  rows: ReadonlyArray<InstalledMcpServer>,
  configuredAgents: ReadonlySet<string>,
  root: string,
): ReadonlyArray<LintFinding> =>
  driftedAgentConfigs(rows, configuredAgents).map((drift) =>
    findingFor({
      name: drift.row.key.name,
      actual: drift.actual,
      fields: drift.fields,
      consumers: drift.consumers,
      root,
    }),
  );

export const mcpServerAgentDriftRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Managed MCP server agent configs match AXM settings.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    Effect.gen(function* () {
      const members = yield* desiredPackMemberBindings(context, "mcp-server");
      const rows = yield* Effect.result(
        Effect.all([
          context.workspace.mcpServers.installed,
          context.workspace.mcpServers.packMemberRows(members),
        ]),
      );
      if (Result.isFailure(rows)) return [];
      const agents = yield* configuredAgentIds(context);
      return findingsForRows(rows.success.flat(), agents, context.subject.root);
    }),
};

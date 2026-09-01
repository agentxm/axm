import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { detectAgentsForScope } from "@agentxm/extension-management/unstable/agents";
import {
  observeInstructionProjection,
  resolveInstructionsConfig,
} from "@agentxm/extension-management/unstable/workspace-configuration";
import { AGENTS } from "@agentxm/extension-model/unstable/agents/registry";
import { CONFIGURABLE_AGENT_IDS } from "@agentxm/extension-model/unstable/agents/types";
import {
  CliRenderer,
  count,
  registerEntity,
  type TableView,
} from "@agentxm/extension-management/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";
import { WorkspaceMutations } from "@agentxm/extension-management/unstable/workspace";
import { scopeFlag } from "../../cli-flags.js";
import { agentLifecycle, lifecycleCell } from "./lifecycle.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { SET_UP_AXM_WORKSPACE } from "../suggested-actions.js";

export interface AgentsListArgs {
  readonly detected: boolean;
  readonly available: boolean;
}

interface AgentListItem {
  readonly id: string;
  readonly name: string;
  readonly configured: boolean;
  readonly detected: boolean;
  readonly instructions: string;
  /** Whether the vendor still maintains the agent: active, deprecated, retired. */
  readonly lifecycle: string;
}

const AgentListItemSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  configured: Schema.Boolean,
  detected: Schema.Boolean,
  instructions: Schema.String,
  lifecycle: Schema.String,
});

export const AgentsListOutputSchema = Schema.Struct({
  items: Schema.Array(AgentListItemSchema),
  configured: Schema.Array(Schema.String),
  detected: Schema.Array(Schema.String),
  available: Schema.Array(Schema.String),
  count: Schema.Number,
});
export type AgentsListOutput = typeof AgentsListOutputSchema.Type;

const AgentListTable = {
  columns: {
    id: { header: "ID" },
    name: { header: "Agent" },
    configured: { header: "Configured", render: (value: boolean) => (value ? "yes" : "no") },
    detected: { header: "Detected", render: (value: boolean) => (value ? "yes" : "no") },
    instructions: { header: "Rules" },
    lifecycle: {
      header: "Lifecycle",
      render: (_value: string, row: AgentListItem) => lifecycleCell(row.id),
    },
  },
} as const satisfies TableView<AgentListItem>;

registerEntity<AgentListItem>("agent", {
  list: {
    columns: AgentListTable.columns,
    emptyMessage: "No agents configured",
    singularLabel: "coding agent",
    pluralLabel: "coding agents",
  },
});

export const handleAgentsList = Effect.fn("Agents.list")(function* (args: AgentsListArgs) {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const configured = yield* ws.getConfiguredAgents();
  const detected = yield* detectAgentsForScope(ws.baseDir, ws.scope).pipe(
    Effect.map((agents) => agents.map((agent) => agent.id)),
  );
  const configuredSet = new Set(configured);
  const detectedSet = new Set(detected);
  const instructionsConfig = yield* ws.getInstructionsConfig();
  const instructionStatuses =
    Option.isSome(instructionsConfig) && instructionsConfig.value !== false
      ? yield* observeInstructionProjection({
          workspaceRoot: ws.baseDir,
          scope: ws.scope,
          configuredAgents: configured,
          config: resolveInstructionsConfig(instructionsConfig.value),
        }).pipe(
          Effect.map(
            ({ status }) => new Map(status.items.map((item) => [item.agentId, item.health])),
          ),
        )
      : new Map<string, string>();

  const baseIds =
    args.available || args.detected
      ? CONFIGURABLE_AGENT_IDS
      : CONFIGURABLE_AGENT_IDS.filter((id) => configuredSet.has(id) || detectedSet.has(id));

  const items = baseIds
    .filter((id) => !args.detected || detectedSet.has(id))
    .map((id) => ({
      id,
      name: AGENTS[id].name,
      configured: configuredSet.has(id),
      detected: detectedSet.has(id),
      instructions: configuredSet.has(id) ? (instructionStatuses.get(id) ?? "manual") : "-",
      lifecycle: agentLifecycle(id).state,
    }));

  const output = {
    items,
    configured: configured.filter((id) => id !== "universal"),
    detected,
    available: [...CONFIGURABLE_AGENT_IDS],
    count: items.length,
  };

  const suggestions = items.length === 0 ? [SET_UP_AXM_WORKSPACE] : [];

  if (yield* renderer.result(output, AgentsListOutputSchema, { suggestions })) {
    return;
  }

  if (items.length === 0) {
    yield* renderer.list("agent", {
      items,
      count: items.length,
      emptyMessage: "No coding agents configured or detected.",
      suggestions,
    });
    return;
  }

  yield* renderer.table(items, AgentListTable, count(items.length, "coding agent"));
});

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List agents from project (default) or user-level configuration"),
  ),
  detected: Flag.boolean("detected").pipe(
    Flag.withDescription("Show detected agents only"),
    Flag.withDefault(false),
  ),
  available: Flag.boolean("available").pipe(
    Flag.withDescription("Show all supported agent IDs"),
    Flag.withDefault(false),
  ),
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope, detected, available }) =>
  handleAgentsList({ detected, available }).pipe(withWorkspace(scope), withRuntime("agents list")),
).pipe(
  withArgvTracking(listConfig),
  Command.withDescription("List coding-agent harnesses configured for AXM"),
  Command.withExamples([
    { command: "axm agents list", description: "Show configured and detected coding agents" },
    { command: "axm agents list --available", description: "Show every supported agent ID" },
    { command: "axm agents list --detected", description: "Show detected coding agents" },
  ]),
);

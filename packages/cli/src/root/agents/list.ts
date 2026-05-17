import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { AGENTS, CONFIGURABLE_AGENT_IDS, detectAgents } from "@agentxm/client-core/unstable/agents";
import {
  CliRenderer,
  registerEntity,
  type TableView,
} from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

export interface AgentsListArgs {
  readonly detected: boolean;
  readonly available: boolean;
}

interface AgentListItem {
  readonly id: string;
  readonly name: string;
  readonly configured: boolean;
  readonly detected: boolean;
}

const AgentListItemSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  configured: Schema.Boolean,
  detected: Schema.Boolean,
});

const AgentsListOutputSchema = Schema.Struct({
  data: Schema.Array(AgentListItemSchema),
  configured: Schema.Array(Schema.String),
  detected: Schema.Array(Schema.String),
  available: Schema.Array(Schema.String),
  count: Schema.Number,
});

const AgentListTable = {
  columns: {
    id: { header: "ID" },
    name: { header: "Agent" },
    configured: { header: "Configured", render: (value: boolean) => (value ? "yes" : "no") },
    detected: { header: "Detected", render: (value: boolean) => (value ? "yes" : "no") },
  },
} as const satisfies TableView<AgentListItem>;

registerEntity<AgentListItem>("agent", {
  list: {
    columns: AgentListTable.columns,
    emptyMessage: "No agents configured",
  },
});

export const handleAgentsList = Effect.fn("Agents.list")(function* (args: AgentsListArgs) {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const configured = yield* ws.getConfiguredAgents();
  const detected = yield* detectAgents(ws.baseDir).pipe(
    Effect.map((agents) => agents.map((agent) => agent.id)),
  );
  const configuredSet = new Set(configured);
  const detectedSet = new Set(detected);

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
    }));

  const output = {
    data: items,
    configured: configured.filter((id) => id !== "universal"),
    detected,
    available: [...CONFIGURABLE_AGENT_IDS],
    count: items.length,
  };

  if (yield* renderer.result(output, AgentsListOutputSchema)) {
    return;
  }

  if (items.length === 0) {
    yield* renderer.info("No coding agents configured or detected.");
    yield* renderer.success("Nothing to show");
    return;
  }

  yield* renderer.table(items, AgentListTable, "Coding agents");
});

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List agents from project (default) or user-level configuration"),
  ),
  detected: Flag.boolean("detected").pipe(Flag.withDescription("Show detected agents only")),
  available: Flag.boolean("available").pipe(Flag.withDescription("Show all supported agent IDs")),
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope, detected, available }) =>
  handleAgentsList({ detected, available }).pipe(withWorkspace(scope), withRuntime("agents list")),
).pipe(
  withArgvTracking(listConfig),
  Command.withAlias("ls"),
  Command.withDescription("List coding-agent harnesses configured for AXM"),
  Command.withExamples([
    { command: "axm agents list", description: "Show configured and detected coding agents" },
    { command: "axm agents list --available", description: "Show every supported agent ID" },
    { command: "axm agents list --detected", description: "Show detected coding agents" },
  ]),
);

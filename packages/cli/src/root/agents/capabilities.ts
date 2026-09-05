import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Argument, Command } from "effect/unstable/cli";
import {
  agentById,
  agentCapabilityStatus,
  axmIntegrationStatus,
  getSupportedExtensionTypesForAgent,
  listCapabilities,
  type Agent,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import { makeAppError } from "../../app-error/index.js";
import { Screen, count, tableDoc, type ViewColumn } from "../../screen/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { withRuntime } from "../../runtime.js";
import { agentLifecycle, isCatalogAgentId, lifecycleCell } from "./lifecycle.js";
import { validateAgentIds } from "@agentxm/workspace-configuration";
import { configurationFailureToAppError } from "../../feature-errors.js";

const NONE = "-";

interface AgentCapabilityItem {
  readonly type: string;
  /** Canonical extension capability identifier. */
  readonly capabilityKey: string;
  /** Vendor surface: native, plugin, either `-deprecated`, or none. */
  readonly native: string;
  /** AXM integration: supported, planned, unsupported, unknown, or writer. */
  readonly axm: string;
  readonly directory: string;
  readonly scopes: string;
}

const AgentCapabilityItemSchema = Schema.Struct({
  type: Schema.String,
  capabilityKey: Schema.String,
  native: Schema.String,
  axm: Schema.String,
  directory: Schema.String,
  scopes: Schema.String,
});

export const AgentCapabilitiesOutputSchema = Schema.Struct({
  agent: Schema.String,
  name: Schema.String,
  lifecycle: Schema.String,
  supported: Schema.Array(Schema.String),
  items: Schema.Array(AgentCapabilityItemSchema),
  count: Schema.Number,
});
export type AgentCapabilitiesOutput = typeof AgentCapabilitiesOutputSchema.Type;

const AgentCapabilityColumns = [
  { header: "Type", priority: "required", value: (row: AgentCapabilityItem) => row.type },
  {
    header: "Capability",
    priority: "required",
    value: (row: AgentCapabilityItem) => row.capabilityKey,
  },
  { header: "Native", value: (row: AgentCapabilityItem) => row.native },
  { header: "AXM", value: (row: AgentCapabilityItem) => row.axm },
  { header: "Directory", priority: "optional", value: (row: AgentCapabilityItem) => row.directory },
  { header: "Scopes", priority: "optional", value: (row: AgentCapabilityItem) => row.scopes },
] satisfies ReadonlyArray<ViewColumn<AgentCapabilityItem>>;

const capabilityRows = (agent: Agent): ReadonlyArray<AgentCapabilityItem> =>
  listCapabilities(agent).map(({ type, capability }) => {
    const native = capability.native;
    return {
      type,
      capabilityKey: type,
      native: agentCapabilityStatus(capability),
      axm: axmIntegrationStatus(capability),
      directory: "directory" in native ? native.directory : NONE,
      scopes: "scopes" in native ? [...native.scopes].sort().join(", ") : NONE,
    };
  });

export const handleAgentsCapabilities = Effect.fn("Agents.capabilities")(function* (
  agentId: string,
) {
  const screen = yield* Screen;
  // Reuses the shared validator for its "did you mean" suggestions; the guard
  // below is what narrows the id for the catalog lookup.
  yield* validateAgentIds([agentId]).pipe(Effect.mapError(configurationFailureToAppError));
  if (!isCatalogAgentId(agentId)) {
    return yield* makeAppError({
      code: "validation",
      detail: `Unknown agent ID: ${agentId}`,
      suggestions: [
        { description: "Inspect supported agent IDs.", cmd: "axm agents list --available" },
      ],
    });
  }

  const agent = agentById(agentId);
  const items = capabilityRows(agent);
  const output = {
    agent: agent.id,
    name: agent.name,
    lifecycle: agentLifecycle(agent.id).state,
    supported: [...getSupportedExtensionTypesForAgent(agent)],
    items,
    count: items.length,
  };

  if (yield* screen.document(output, AgentCapabilitiesOutputSchema)) {
    return;
  }

  const lifecycle = lifecycleCell(agent.id);
  yield* screen.result(
    tableDoc(
      items,
      AgentCapabilityColumns,
      `${agent.name}${lifecycle === "" ? "" : ` (${lifecycle})`}   ${count(items.length, "capability")}`,
    ),
  );
});

const capabilitiesConfig = {
  id: Argument.string("id").pipe(
    Argument.withDescription("Coding-agent ID, such as claude-code or cursor"),
  ),
} as const;

export const capabilitiesCommand = Command.make("capabilities", capabilitiesConfig, ({ id }) =>
  handleAgentsCapabilities(id).pipe(withRuntime("agents capabilities")),
).pipe(
  withArgvTracking(capabilitiesConfig),
  Command.withDescription(
    "Show what one coding agent supports, and how far AXM integrates with it",
  ),
  Command.withExamples([
    {
      command: "axm agents capabilities claude-code",
      description: "Show Claude Code's modeled extension capabilities",
    },
    {
      command: "axm agents capabilities cursor --json",
      description: "Emit one agent's capability matrix as JSON",
    },
  ]),
);

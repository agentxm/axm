import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import {
  ConfigureAgents,
  ConfiguredAgentInventorySchema,
  type ConfiguredAgentInventory,
} from "@agentxm/workspace-configuration";
import { Screen, count, inventoryDoc, type ViewColumn } from "../../screen/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import { lifecycleCell } from "./lifecycle-cell.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { SET_UP_AXM_WORKSPACE } from "../suggested-actions.js";
import { configurationFailureToAppError } from "../../feature-errors.js";

export interface AgentsListArgs {
  readonly detected: boolean;
  readonly available: boolean;
}

/**
 * The name this command's machine document is registered under in
 * `machine-output-contracts.ts`. The document itself is the configuration
 * feature's typed inventory; the registry names it, so the name stays.
 */
export const AgentsListOutputSchema = ConfiguredAgentInventorySchema;

type AgentListItem = ConfiguredAgentInventory["items"][number];

const AgentListColumns = [
  { header: "ID", priority: "required", value: (row: AgentListItem) => row.id },
  { header: "Agent", value: (row: AgentListItem) => row.name },
  { header: "Configured", value: (row: AgentListItem) => (row.configured ? "yes" : "no") },
  { header: "Detected", value: (row: AgentListItem) => (row.detected ? "yes" : "no") },
  { header: "Rules", priority: "optional", value: (row: AgentListItem) => row.instructions },
  {
    header: "Lifecycle",
    priority: "optional",
    value: (row: AgentListItem) => lifecycleCell(row.id),
  },
] satisfies ReadonlyArray<ViewColumn<AgentListItem>>;

export const handleAgentsList = Effect.fn("Agents.list")(function* (args: AgentsListArgs) {
  const screen = yield* Screen;
  const inventory = yield* ConfigureAgents.list({
    detected: args.detected,
    available: args.available,
  }).pipe(Effect.mapError(configurationFailureToAppError));

  const suggestions = inventory.items.length === 0 ? [SET_UP_AXM_WORKSPACE] : [];

  if (yield* screen.document(inventory, ConfiguredAgentInventorySchema, { suggestions })) {
    return;
  }
  yield* screen.result([
    ...inventoryDoc({
      rows: inventory.items,
      columns: AgentListColumns,
      summary: count(inventory.items.length, "coding agent"),
      empty: "No coding agents configured or detected.",
    }),
    ...(suggestions.length === 0 ? [] : [{ _tag: "next", actions: suggestions } as const]),
  ]);
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
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("List coding-agent harnesses configured for AXM"),
  Command.withExamples([
    { command: "axm agents list", description: "Show configured and detected coding agents" },
    { command: "axm agents list --available", description: "Show every supported agent ID" },
    { command: "axm agents list --detected", description: "Show detected coding agents" },
  ]),
);

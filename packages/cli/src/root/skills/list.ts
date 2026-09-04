import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { Screen, inventoryDoc, type ViewColumn } from "../../screen/index.js";
import {
  ExtensionInventorySchema,
  WorkspaceMutations,
  type ConfiguredAgentOutcome,
} from "@agentxm/workspace-state";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { agentFlag } from "../../cli-flags/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  augmentInventory,
  inventoryActivation,
  inventoryAgentOutcomes,
  inventoryState,
  inventorySummary,
} from "../inventory-view.js";

export interface ListHandlerArgs {
  readonly agents: readonly string[];
}

interface SkillListItem {
  readonly name: string;
  readonly type: string;
  readonly state: string;
  readonly activation: string;
  readonly agents: ReadonlyArray<string>;
  readonly agentOutcomes: ReadonlyArray<ConfiguredAgentOutcome>;
}

const SkillListColumns = [
  { header: "Name", priority: "required", value: (row: SkillListItem) => row.name },
  { header: "State", value: (row: SkillListItem) => row.state },
  { header: "Activation", value: (row: SkillListItem) => row.activation },
  { header: "Type", priority: "optional", value: (row: SkillListItem) => row.type },
  {
    header: "Agents",
    value: (row: SkillListItem) => (row.agents.length === 0 ? "none" : row.agents.join(", ")),
  },
  {
    header: "Agent outcomes",
    priority: "optional",
    value: (row: SkillListItem) => inventoryAgentOutcomes(row.agentOutcomes),
  },
] satisfies ReadonlyArray<ViewColumn<SkillListItem>>;

export const handleList = Effect.fn("List.handle")(function* (args: ListHandlerArgs) {
  const screen = yield* Screen;
  const ws = yield* WorkspaceMutations;
  const inventory = yield* ws.records.getExtensionInventory("skill", {
    agents: args.agents,
  });
  const locked = yield* ws.getLockedSkills();
  const items = inventory.items.map((row) => ({
    name: row.name,
    type: locked[row.name]?.type ?? "detected",
    state: inventoryState(row),
    activation: inventoryActivation(row),
    agents: row.agents,
    agentOutcomes: row.agentOutcomes,
  }));
  const output = augmentInventory(inventory, (row) => ({
    sourceType: locked[row.name]?.type ?? "detected",
  }));

  if (yield* screen.document(output, ExtensionInventorySchema)) return;
  yield* screen.result(
    inventoryDoc({
      rows: items,
      columns: SkillListColumns,
      summary: inventorySummary(inventory, "skill"),
      empty:
        args.agents.length === 0
          ? "No skills found"
          : "No skills matched the selected agent filter.",
    }),
  );
});

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List skills from project (default) or user-level configuration"),
  ),
  agent: agentFlag.pipe(Flag.withDescription("Show only skills detected for specific agents")),
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope, agent }) =>
  handleList({ agents: agent }).pipe(
    withWorkspace({ scope, allowUninitialized: true }),
    withRuntime("skills list"),
  ),
).pipe(
  withArgvTracking(listConfig),
  Command.withDescription("List detected skills and their lifecycle classification"),
  Command.withExamples([
    { command: "axm skills list", description: "Inventory detected skills" },
    {
      command: "axm skills list --scope user",
      description: "Check user-level skills",
    },
    {
      command: "axm skills list --agent claude-code",
      description: "See skills for a specific agent",
    },
  ]),
);

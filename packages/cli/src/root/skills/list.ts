import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { CliRenderer, registerEntity, type TableView } from "../../cli-renderer/index.js";
import {
  ExtensionInventorySchema,
  WorkspaceMutations,
  type ConfiguredAgentOutcome,
} from "@agentxm/workspace-state";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  augmentInventory,
  inventoryActivation,
  inventoryAgentOutcomes,
  inventoryState,
  inventorySummary,
  renderEmptyInventory,
  renderInventoryTable,
} from "../extension-inventory.js";

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

const SkillListTable = {
  columns: {
    name: { header: "Name" },
    state: { header: "State" },
    activation: { header: "Activation" },
    type: { header: "Type" },
    agents: {
      header: "Agents",
      render: (value: ReadonlyArray<string>) => (value.length === 0 ? "none" : value.join(", ")),
    },
    agentOutcomes: { header: "Agent outcomes", render: inventoryAgentOutcomes },
  },
} as const satisfies TableView<SkillListItem>;

registerEntity<SkillListItem>("skill", {
  list: {
    columns: SkillListTable.columns,
    emptyMessage: "No skills found",
    singularLabel: "skill",
    pluralLabel: "skills",
  },
});

export const handleList = Effect.fn("List.handle")(function* (args: ListHandlerArgs) {
  const renderer = yield* CliRenderer;
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

  if (yield* renderer.result(output, ExtensionInventorySchema)) return;
  if (items.length === 0) {
    yield* renderEmptyInventory(
      renderer,
      args.agents.length === 0 ? "No skills found" : "No skills matched the selected agent filter.",
    );
    return;
  }

  yield* renderInventoryTable(
    renderer,
    items,
    SkillListTable,
    inventorySummary(inventory, "skill"),
  );
});

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List skills from project (default) or user-level configuration"),
  ),
  agent: Flag.string("agent").pipe(
    Flag.withDescription("Show only skills detected for specific agents"),
    Flag.atLeast(0),
  ),
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

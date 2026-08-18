import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import {
  CliRenderer,
  registerEntity,
  type TableView,
} from "@agentxm/client-core/unstable/cli-renderer";
import {
  ExtensionInventorySchema,
  WorkspaceMutations,
} from "@agentxm/client-core/unstable/workspace";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import type { ConfiguredAgentOutcome } from "@agentxm/client-core/unstable/plan";
import { scopeFlag } from "../../cli-flags.js";
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

interface RuleListItem {
  readonly name: string;
  readonly state: string;
  readonly activation: string;
  readonly source: string;
  readonly locked: boolean;
  readonly agentOutcomes: ReadonlyArray<ConfiguredAgentOutcome>;
}

const RuleListTable = {
  columns: {
    name: { header: "Name" },
    state: { header: "State" },
    activation: { header: "Activation" },
    source: { header: "Source" },
    locked: { header: "Locked", render: (value: boolean) => (value ? "yes" : "no") },
    agentOutcomes: { header: "Agent outcomes", render: inventoryAgentOutcomes },
  },
} as const satisfies TableView<RuleListItem>;

// Keyed by the catalog type id, per parity obligation 8.6. The sibling
// `agent-rule` entity is deliberately separate: it carries instruction-file
// targets, not rule extensions.
registerEntity<RuleListItem>("rule", {
  list: {
    columns: RuleListTable.columns,
    emptyMessage: "No rules found",
    singularLabel: "rule",
    pluralLabel: "rules",
  },
});

export const handleListRule = Effect.fn("ListRule.handle")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const inventory = yield* ws.records.getExtensionInventory("rule", {});
  const configured = yield* ws.getConfiguredRuleEntries();
  const locked = yield* ws.getLockedRules();
  const items = inventory.items.map((row) => ({
    name: row.name,
    state: inventoryState(row),
    activation: inventoryActivation(row),
    source: configured[row.name]?.source ?? row.origins.join(", "),
    locked: locked[row.name] !== undefined,
    agentOutcomes: row.agentOutcomes,
  }));
  const details = new Map(items.map((item) => [item.name, item]));
  const output = augmentInventory(inventory, (row) => {
    const item = details.get(row.name);
    return {
      source: item?.source ?? row.origins.join(", "),
      locked: item?.locked ?? false,
    };
  });

  if (yield* renderer.result(output, ExtensionInventorySchema)) return;
  if (items.length === 0) {
    yield* renderEmptyInventory(renderer, "No rules found");
    return;
  }
  yield* renderInventoryTable(renderer, items, RuleListTable, inventorySummary(inventory, "rule"));
});

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List rules from project (default) or user-level configuration"),
  ),
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope }) =>
  handleListRule().pipe(
    withWorkspace({ scope, allowUninitialized: true }),
    withRuntime("rules list"),
  ),
).pipe(
  withArgvTracking(listConfig),
  Command.withAlias("ls"),
  Command.withDescription("List detected rules and their lifecycle classification"),
  Command.withExamples([
    {
      command: "axm rules list",
      description: "Inventory detected rules",
    },
  ]),
);

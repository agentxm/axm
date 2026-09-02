import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { Screen, inventoryDoc, type ViewColumn } from "../../screen/index.js";
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
} from "../inventory-view.js";

interface RuleListItem {
  readonly name: string;
  readonly state: string;
  readonly activation: string;
  readonly source: string;
  readonly locked: boolean;
  readonly agentOutcomes: ReadonlyArray<ConfiguredAgentOutcome>;
}

const RuleListColumns = [
  { header: "Name", value: (row: RuleListItem) => row.name },
  { header: "State", value: (row: RuleListItem) => row.state },
  { header: "Activation", value: (row: RuleListItem) => row.activation },
  { header: "Source", value: (row: RuleListItem) => row.source },
  { header: "Locked", value: (row: RuleListItem) => (row.locked ? "yes" : "no") },
  {
    header: "Agent outcomes",
    value: (row: RuleListItem) => inventoryAgentOutcomes(row.agentOutcomes),
  },
] satisfies ReadonlyArray<ViewColumn<RuleListItem>>;

export const handleListRule = Effect.fn("ListRule.handle")(function* () {
  const screen = yield* Screen;
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

  if (yield* screen.document(output, ExtensionInventorySchema)) return;
  yield* screen.result(
    inventoryDoc({
      rows: items,
      columns: RuleListColumns,
      summary: inventorySummary(inventory, "rule"),
      empty: "No rules found",
    }),
  );
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
  Command.withDescription("List detected rules and their lifecycle classification"),
  Command.withExamples([
    {
      command: "axm rules list",
      description: "Inventory detected rules",
    },
  ]),
);

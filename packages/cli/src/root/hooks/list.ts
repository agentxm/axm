import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
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
import { HookManager } from "@agentxm/extension-workspace";

interface HookListItem {
  readonly name: string;
  readonly state: string;
  readonly activation: string;
  readonly source: string;
  readonly locked: boolean;
  readonly agentOutcomes: ReadonlyArray<ConfiguredAgentOutcome>;
}

const HookListColumns = [
  { header: "Name", value: (row: HookListItem) => row.name },
  { header: "State", value: (row: HookListItem) => row.state },
  { header: "Activation", value: (row: HookListItem) => row.activation },
  { header: "Source", value: (row: HookListItem) => row.source },
  { header: "Locked", value: (row: HookListItem) => (row.locked ? "yes" : "no") },
  {
    header: "Agent outcomes",
    value: (row: HookListItem) => inventoryAgentOutcomes(row.agentOutcomes),
  },
] satisfies ReadonlyArray<ViewColumn<HookListItem>>;

export const handleListHook = Effect.fn("ListHook.handle")(function* () {
  const screen = yield* Screen;
  const ws = yield* WorkspaceMutations;
  const inventory = yield* ws.records.getExtensionInventory("hook", {});
  const configured = yield* ws.getConfiguredHookEntries();
  const locked = yield* ws.getLockedHooks();
  const manager = yield* Effect.serviceOption(HookManager);
  const effectiveOutcomes =
    Option.isSome(manager) && manager.value.configuredAgentOutcomes !== undefined
      ? yield* manager.value.configuredAgentOutcomes("current")
      : [];
  const items = inventory.items.map((row) => {
    const agentOutcomes =
      row.enabled === false
        ? row.agentOutcomes
        : effectiveOutcomes.filter((outcome) => outcome.name === row.name);
    return {
      name: row.name,
      state: inventoryState(row),
      activation: inventoryActivation(row),
      source: configured[row.name]?.source ?? row.origins.join(", "),
      locked: locked[row.name] !== undefined,
      agentOutcomes,
    };
  });
  const details = new Map(items.map((item) => [item.name, item]));
  const output = augmentInventory(inventory, (row) => {
    const item = details.get(row.name);
    return {
      source: item?.source ?? row.origins.join(", "),
      locked: item?.locked ?? false,
      agentOutcomes: item?.agentOutcomes ?? row.agentOutcomes,
    };
  });

  if (yield* screen.document(output, ExtensionInventorySchema)) return;
  yield* screen.result(
    inventoryDoc({
      rows: items,
      columns: HookListColumns,
      summary: inventorySummary(inventory, "hooks package"),
      empty: "No hooks packages found",
    }),
  );
});

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List hooks packages from project (default) or user-level configuration"),
  ),
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope }) =>
  handleListHook().pipe(
    withWorkspace({ scope, allowUninitialized: true }),
    withRuntime("hooks list"),
  ),
).pipe(
  withArgvTracking(listConfig),
  Command.withDescription("List detected hooks packages and their lifecycle classification"),
  Command.withExamples([
    {
      command: "axm hooks list",
      description: "Inventory detected hooks packages",
    },
  ]),
);

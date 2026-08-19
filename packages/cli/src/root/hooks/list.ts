import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
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
import { HookManager } from "@agentxm/client-core/unstable/hooks";
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

interface HookListItem {
  readonly name: string;
  readonly state: string;
  readonly activation: string;
  readonly source: string;
  readonly locked: boolean;
  readonly agentOutcomes: ReadonlyArray<ConfiguredAgentOutcome>;
}

const HookListTable = {
  columns: {
    name: { header: "Name" },
    state: { header: "State" },
    activation: { header: "Activation" },
    source: { header: "Source" },
    locked: { header: "Locked", render: (value: boolean) => (value ? "yes" : "no") },
    agentOutcomes: { header: "Agent outcomes", render: inventoryAgentOutcomes },
  },
} as const satisfies TableView<HookListItem>;

// Keyed by the catalog type id, per parity obligation 8.6.
registerEntity<HookListItem>("hook", {
  list: {
    columns: HookListTable.columns,
    emptyMessage: "No hooks packages found",
    singularLabel: "hooks package",
    pluralLabel: "hooks packages",
  },
});

export const handleListHook = Effect.fn("ListHook.handle")(function* () {
  const renderer = yield* CliRenderer;
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

  if (yield* renderer.result(output, ExtensionInventorySchema)) return;
  if (items.length === 0) {
    yield* renderEmptyInventory(renderer, "No hooks packages found");
    return;
  }
  yield* renderInventoryTable(
    renderer,
    items,
    HookListTable,
    inventorySummary(inventory, "hooks package"),
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

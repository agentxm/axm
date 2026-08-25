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
import {
  parseExtensionFqnParts,
  parseSourceQualifiedRegistrySourcePatternParts,
} from "@agentxm/client-core/unstable/extensions";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import type { ConfiguredAgentOutcome } from "@agentxm/client-core/unstable/plan";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  augmentInventory,
  inventoryState,
  inventoryAgentOutcomes,
  inventorySummary,
  renderEmptyInventory,
  renderInventoryTable,
} from "../extension-inventory.js";

interface PackListItem {
  readonly name: string;
  readonly state: string;
  readonly owner: string;
  readonly version: string;
  readonly source: string;
  readonly agentOutcomes: ReadonlyArray<ConfiguredAgentOutcome>;
}

const PackListTable = {
  columns: {
    name: { header: "Name" },
    state: { header: "State" },
    owner: { header: "Owner" },
    version: { header: "Version" },
    source: { header: "Source" },
    agentOutcomes: { header: "Agent outcomes", render: inventoryAgentOutcomes },
  },
} as const satisfies TableView<PackListItem>;

registerEntity<PackListItem>("pack", {
  list: {
    columns: PackListTable.columns,
    emptyMessage: "No packs found",
    singularLabel: "pack",
    pluralLabel: "packs",
  },
});

export const handleList = Effect.fn("PacksList.handle")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const inventory = yield* ws.records.getExtensionInventory("pack", {});
  const packs = yield* ws.getLockedPacks();

  const items: ReadonlyArray<PackListItem> = inventory.items.map((row) => {
    const entry = packs[row.name];
    const configuredSource = row.source ?? row.origins.join(", ");
    const parsedRegistrySource = parseSourceQualifiedRegistrySourcePatternParts(configuredSource);
    const parsedWorkspaceSource = parseExtensionFqnParts(
      configuredSource.replace(/^workspace:/u, "").replace(/@[^@/]+$/u, ""),
    );
    return {
      name: row.name,
      state: inventoryState(row),
      owner: entry?.owner ?? parsedRegistrySource?.owner ?? parsedWorkspaceSource?.owner ?? "n/a",
      version: entry?.resolvedVersion ?? "n/a",
      source: configuredSource.startsWith("workspace:")
        ? "workspace"
        : (entry?.sourceName ?? configuredSource),
      agentOutcomes: row.agentOutcomes,
    };
  });
  const details = new Map(items.map((item) => [item.name, item]));
  const output = augmentInventory(inventory, (row) => {
    const item = details.get(row.name);
    return {
      owner: item?.owner ?? "n/a",
      version: item?.version ?? "n/a",
      source: item?.source ?? row.origins.join(", "),
    };
  });

  if (yield* renderer.result(output, ExtensionInventorySchema)) return;
  if (items.length === 0) {
    yield* renderEmptyInventory(renderer, "No packs found");
    return;
  }

  yield* renderInventoryTable(renderer, items, PackListTable, inventorySummary(inventory, "pack"));
});

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List packs from project (default) or user-level configuration"),
  ),
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope }) =>
  handleList().pipe(withWorkspace({ scope, allowUninitialized: true }), withRuntime("packs list")),
).pipe(
  withArgvTracking(listConfig),
  Command.withDescription("List detected packs and their lifecycle classification"),
  Command.withExamples([
    { command: "axm packs list", description: "Inventory detected packs" },
    {
      command: "axm packs list --scope user",
      description: "Check user-level packs",
    },
  ]),
);

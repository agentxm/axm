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
import { includeIgnoredFlag, scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  augmentInventory,
  inventoryIgnoredBy,
  inventoryState,
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
  readonly ignoredBy: string;
}

const PackListTable = {
  columns: {
    name: { header: "Name" },
    state: { header: "State" },
    owner: { header: "Owner" },
    version: { header: "Version" },
    source: { header: "Source" },
    ignoredBy: { header: "Ignored by" },
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

export const handleList = Effect.fn("PacksList.handle")(function* (args: {
  readonly includeIgnored: boolean;
}) {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const inventory = yield* ws.records.getExtensionInventory("pack", {
    includeIgnored: args.includeIgnored,
  });
  const packs = yield* ws.getLockedPacks();

  const items: ReadonlyArray<PackListItem> = inventory.items.map((row) => {
    const entry = Object.values(packs).find((candidate) => candidate.name === row.name);
    return {
      name: row.name,
      state: inventoryState(row),
      owner: entry?.owner ?? "n/a",
      version:
        entry === undefined
          ? "n/a"
          : entry.type === "workspace"
            ? entry.version
            : entry.resolvedVersion,
      source:
        entry === undefined
          ? row.origins.join(", ")
          : entry.type === "workspace"
            ? "workspace"
            : entry.sourceName,
      ignoredBy: inventoryIgnoredBy(row),
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
  includeIgnored: includeIgnoredFlag,
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope, includeIgnored }) =>
  handleList({ includeIgnored }).pipe(
    withWorkspace({ scope, allowUninitialized: true }),
    withRuntime("packs list"),
  ),
).pipe(
  withArgvTracking(listConfig),
  Command.withAlias("ls"),
  Command.withDescription("List detected packs and their lifecycle classification"),
  Command.withExamples([
    { command: "axm packs list", description: "Inventory detected packs" },
    {
      command: "axm packs list --scope user",
      description: "Check user-level packs",
    },
  ]),
);

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
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  inventoryActivation,
  inventoryState,
  inventorySummary,
  renderEmptyInventory,
  renderInventoryTable,
} from "../extension-inventory.js";

interface FilesListItem {
  readonly name: string;
  readonly state: string;
  readonly activation: string;
  readonly source: string;
  readonly locked: boolean;
}

const FilesListTable = {
  columns: {
    name: { header: "Name" },
    state: { header: "State" },
    activation: { header: "Activation" },
    source: { header: "Source" },
    locked: { header: "Locked", render: (value: boolean) => (value ? "yes" : "no") },
  },
} as const satisfies TableView<FilesListItem>;

registerEntity<FilesListItem>("files", {
  list: {
    columns: FilesListTable.columns,
    emptyMessage: "No files packages found",
    singularLabel: "files package",
    pluralLabel: "files packages",
  },
});

export const handleListFiles = Effect.fn("ListFiles.handle")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const inventory = yield* ws.records.getExtensionInventory("files", { includeIgnored: false });
  const configured = yield* ws.getConfiguredFilesEntries();
  const locked = yield* ws.getLockedFiles();
  const items = inventory.items.map((row) => ({
    name: row.name,
    state: inventoryState(row),
    activation: inventoryActivation(row),
    source: configured[row.name]?.source ?? row.origins.join(", "),
    locked: locked[row.name] !== undefined,
  }));
  const details = new Map(items.map((item) => [item.name, item]));
  const output = {
    ...inventory,
    items: inventory.items.map((row) => {
      const item = details.get(row.name);
      return {
        ...row,
        source: item?.source ?? row.origins.join(", "),
        locked: item?.locked ?? false,
      };
    }),
  };

  if (yield* renderer.result(output, ExtensionInventorySchema)) return;
  if (items.length === 0) {
    yield* renderEmptyInventory(renderer, "No files packages found");
    return;
  }
  yield* renderInventoryTable(
    renderer,
    items,
    FilesListTable,
    inventorySummary(inventory, "files package"),
  );
});

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List files packages from project (default) or user-level configuration"),
  ),
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope }) =>
  handleListFiles().pipe(
    withWorkspace({ scope, allowUninitialized: true }),
    withRuntime("files list"),
  ),
).pipe(
  withArgvTracking(listConfig),
  Command.withAlias("ls"),
  Command.withDescription("List detected files packages and their lifecycle classification"),
  Command.withExamples([
    {
      command: "axm files list",
      description: "Inventory detected files packages",
    },
  ]),
);

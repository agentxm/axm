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
  inventoryActivation,
  inventoryIgnoredBy,
  inventoryState,
  inventorySummary,
  renderEmptyInventory,
  renderInventoryTable,
} from "../extension-inventory.js";

interface CommandListItem {
  readonly name: string;
  readonly state: string;
  readonly activation: string;
  readonly source: string;
  readonly ignoredBy: string;
}

const CommandListTable = {
  columns: {
    name: { header: "Name" },
    state: { header: "State" },
    activation: { header: "Activation" },
    source: {
      header: "Source",
      render: (value: string) => (value.length > 0 ? value : "n/a"),
    },
    ignoredBy: { header: "Ignored by" },
  },
} as const satisfies TableView<CommandListItem>;

registerEntity<CommandListItem>("command", {
  list: {
    columns: CommandListTable.columns,
    emptyMessage: "No commands found",
    singularLabel: "command",
    pluralLabel: "commands",
  },
});

export const handleListCommands = Effect.fn("ListCommands.handle")(function* (args: {
  readonly includeIgnored: boolean;
}) {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const inventory = yield* ws.records.getExtensionInventory("command", {
    includeIgnored: args.includeIgnored,
  });
  const configured = yield* ws.getConfiguredCommandEntries();
  const locked = yield* ws.getLockedCommands();
  const items = inventory.items.map((row) => ({
    name: row.name,
    state: inventoryState(row),
    activation: inventoryActivation(row),
    source: configured[row.name]?.source ?? locked[row.name]?.type ?? row.origins.join(", "),
    ignoredBy: inventoryIgnoredBy(row),
  }));
  const output = augmentInventory(inventory, (row) => ({
    source: configured[row.name]?.source ?? locked[row.name]?.type ?? row.origins.join(", "),
  }));

  if (yield* renderer.result(output, ExtensionInventorySchema)) return;
  if (items.length === 0) {
    yield* renderEmptyInventory(renderer, "No commands found");
    return;
  }

  yield* renderInventoryTable(
    renderer,
    items,
    CommandListTable,
    inventorySummary(inventory, "command"),
  );
});

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List commands from project (default) or user-level configuration"),
  ),
  includeIgnored: includeIgnoredFlag,
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope, includeIgnored }) =>
  handleListCommands({ includeIgnored }).pipe(
    withWorkspace({ scope, allowUninitialized: true }),
    withRuntime("commands list"),
  ),
).pipe(
  withArgvTracking(listConfig),
  Command.withAlias("ls"),
  Command.withDescription("List detected commands and their lifecycle classification"),
  Command.withExamples([
    { command: "axm commands list", description: "Inventory detected commands" },
    {
      command: "axm commands list --scope user",
      description: "Check user-level commands",
    },
  ]),
);

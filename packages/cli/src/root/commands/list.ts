import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  CliRenderer,
  registerEntity,
  type TableView,
} from "@agentxm/client-core/unstable/cli-renderer";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

interface CommandListItem {
  readonly name: string;
  readonly lifecycle: string;
  readonly enabled: boolean;
  readonly source: string;
}

const CommandListTable = {
  columns: {
    name: { header: "Name" },
    lifecycle: { header: "Lifecycle" },
    enabled: {
      header: "Status",
      render: (value: boolean) => (value ? "enabled" : "disabled"),
    },
    source: {
      header: "Source",
      render: (value: string) => (value.length > 0 ? value : "n/a"),
    },
  },
} as const satisfies TableView<CommandListItem>;

registerEntity<CommandListItem>("command", {
  list: {
    columns: CommandListTable.columns,
    emptyMessage: "No commands installed",
  },
});

export const handleListCommands = Effect.fn("ListCommands.handle")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const installedCommands = yield* ws.records.getInstalledCommands();
  const unmanagedCommands = yield* ws.records.getUnmanagedCommands();

  const installedItems = Object.entries(installedCommands).map(([name, entry]) => ({
    name,
    source:
      typeof entry.source === "string" ? entry.source : Option.getOrElse(entry.source, () => ""),
    enabled: entry.enabled,
    lifecycle: entry.lifecycle,
  }));

  const unmanagedItems = Object.entries(unmanagedCommands).map(([name, entry]) => ({
    name,
    source: Option.getOrElse(entry.source, () => ""),
    enabled: entry.enabled,
    lifecycle: "unmanaged",
  }));

  const items = [...installedItems, ...unmanagedItems];

  if (yield* renderer.list("command", { items, count: items.length })) {
    return;
  }

  if (items.length === 0) {
    yield* renderer.info("No commands installed");
    return;
  }

  yield* renderer.table(items, CommandListTable, "Installed commands");
});

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List commands from project (default) or user-level configuration"),
  ),
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope }) =>
  handleListCommands().pipe(withWorkspace(scope), withRuntime("commands list")),
).pipe(
  withArgvTracking(listConfig),
  Command.withAlias("ls"),
  Command.withDescription("List installed commands"),
  Command.withExamples([
    { command: "axm commands list", description: "See what commands are installed" },
    {
      command: "axm commands list --scope user",
      description: "Check user-level commands",
    },
  ]),
);

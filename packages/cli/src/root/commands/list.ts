import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { CliRenderer, type TableView } from "@axm.sh/core/unstable/cli-renderer";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

const CommandListItemSchema = Schema.Struct({
  name: Schema.String,
  lifecycle: Schema.String,
  enabled: Schema.Boolean,
  source: Schema.String,
});
type CommandListItem = typeof CommandListItemSchema.Type;

const CommandListDocumentFields = {
  items: Schema.Array(CommandListItemSchema),
  count: Schema.Number,
} satisfies Schema.Struct.Fields;

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

export const handleListCommands = Effect.fn("ListCommands.handle")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* Workspace;
  const commands = yield* ws.getClassifiedCommands();

  const entries = Object.entries(commands);

  const items = entries.map(([name, entry]) => ({
    name,
    source: typeof entry.source === "string" ? entry.source : "",
    enabled: entry.enabled,
    lifecycle: entry.lifecycle,
  }));

  if (
    yield* renderer.document(
      "commands.list",
      { items, count: items.length },
      CommandListDocumentFields,
    )
  ) {
    return;
  }

  if (entries.length === 0) {
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

import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import {
  CliRenderer,
  registerEntity,
  type TableView,
} from "@agentxm/client-core/unstable/cli-renderer";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

interface FilesListItem {
  readonly name: string;
  readonly enabled: boolean;
  readonly source: string;
  readonly locked: boolean;
}

const FilesListTable = {
  columns: {
    name: { header: "Name" },
    enabled: { header: "Status", render: (value: boolean) => (value ? "enabled" : "disabled") },
    source: { header: "Source" },
    locked: { header: "Locked", render: (value: boolean) => (value ? "yes" : "no") },
  },
} as const satisfies TableView<FilesListItem>;

registerEntity<FilesListItem>("files", {
  list: {
    columns: FilesListTable.columns,
    emptyMessage: "No files packages installed",
  },
});

export const handleListFiles = Effect.fn("ListFiles.handle")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const configured = yield* ws.getConfiguredFilesEntries();
  const locked = yield* ws.getLockedFiles();
  const names = [...new Set([...Object.keys(configured), ...Object.keys(locked)])].sort();
  const items = names.map((name) => ({
    name,
    enabled: configured[name]?.enabled ?? true,
    source: configured[name]?.source ?? "",
    locked: locked[name] !== undefined,
  }));

  if (yield* renderer.list("files", { items, count: items.length })) return;
  if (items.length === 0) {
    yield* renderer.info("No files packages installed");
    return;
  }
  yield* renderer.table(items, FilesListTable, "Installed files packages");
});

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List files packages from project (default) or user-level configuration"),
  ),
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope }) =>
  handleListFiles().pipe(withWorkspace(scope), withRuntime("files list")),
).pipe(
  withArgvTracking(listConfig),
  Command.withAlias("ls"),
  Command.withDescription("List installed files packages"),
  Command.withExamples([
    {
      command: "axm files list",
      description: "List installed files packages",
    },
  ]),
);

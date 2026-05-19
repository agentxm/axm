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

interface FileListItem {
  readonly name: string;
  readonly enabled: boolean;
  readonly source: string;
  readonly locked: boolean;
}

const FileListTable = {
  columns: {
    name: { header: "Name" },
    enabled: { header: "Status", render: (value: boolean) => (value ? "enabled" : "disabled") },
    source: { header: "Source" },
    locked: { header: "Locked", render: (value: boolean) => (value ? "yes" : "no") },
  },
} as const satisfies TableView<FileListItem>;

registerEntity<FileListItem>("file", {
  list: {
    columns: FileListTable.columns,
    emptyMessage: "No context files packages installed",
  },
});

export const handleListContextFiles = Effect.fn("ListContextFiles.handle")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const configured = yield* ws.getConfiguredFileEntries();
  const locked = yield* ws.getLockedFiles();
  const names = [...new Set([...Object.keys(configured), ...Object.keys(locked)])].sort();
  const items = names.map((name) => ({
    name,
    enabled: configured[name]?.enabled ?? true,
    source: configured[name]?.source ?? "",
    locked: locked[name] !== undefined,
  }));

  if (yield* renderer.list("file", { items, count: items.length })) return;
  if (items.length === 0) {
    yield* renderer.info("No context files packages installed");
    return;
  }
  yield* renderer.table(items, FileListTable, "Installed context files packages");
});

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List files from project (default) or user-level configuration"),
  ),
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope }) =>
  handleListContextFiles().pipe(withWorkspace(scope), withRuntime("context-files list")),
).pipe(
  withArgvTracking(listConfig),
  Command.withAlias("ls"),
  Command.withDescription("List installed context files packages"),
  Command.withExamples([
    {
      command: "axm context-files list",
      description: "List installed context files packages",
    },
  ]),
);

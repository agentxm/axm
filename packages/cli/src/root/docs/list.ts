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

interface DocsListItem {
  readonly name: string;
  readonly enabled: boolean;
  readonly source: string;
  readonly locked: boolean;
}

const DocsListTable = {
  columns: {
    name: { header: "Name" },
    enabled: { header: "Status", render: (value: boolean) => (value ? "enabled" : "disabled") },
    source: { header: "Source" },
    locked: { header: "Locked", render: (value: boolean) => (value ? "yes" : "no") },
  },
} as const satisfies TableView<DocsListItem>;

registerEntity<DocsListItem>("docs", {
  list: {
    columns: DocsListTable.columns,
    emptyMessage: "No docs packages installed",
  },
});

export const handleListDocs = Effect.fn("ListDocs.handle")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const configured = yield* ws.getConfiguredDocsEntries();
  const locked = yield* ws.getLockedDocs();
  const names = [...new Set([...Object.keys(configured), ...Object.keys(locked)])].sort();
  const items = names.map((name) => ({
    name,
    enabled: configured[name]?.enabled ?? true,
    source: configured[name]?.source ?? "",
    locked: locked[name] !== undefined,
  }));

  if (yield* renderer.list("docs", { items, count: items.length })) return;
  if (items.length === 0) {
    yield* renderer.info("No docs packages installed");
    return;
  }
  yield* renderer.table(items, DocsListTable, "Installed docs packages");
});

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List docs packages from project (default) or user-level configuration"),
  ),
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope }) =>
  handleListDocs().pipe(withWorkspace(scope), withRuntime("docs list")),
).pipe(
  withArgvTracking(listConfig),
  Command.withAlias("ls"),
  Command.withDescription("List installed docs packages"),
  Command.withExamples([
    {
      command: "axm docs list",
      description: "List installed docs packages",
    },
  ]),
);

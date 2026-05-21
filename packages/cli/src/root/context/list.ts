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

interface ContextListItem {
  readonly name: string;
  readonly enabled: boolean;
  readonly source: string;
  readonly locked: boolean;
}

const ContextListTable = {
  columns: {
    name: { header: "Name" },
    enabled: { header: "Status", render: (value: boolean) => (value ? "enabled" : "disabled") },
    source: { header: "Source" },
    locked: { header: "Locked", render: (value: boolean) => (value ? "yes" : "no") },
  },
} as const satisfies TableView<ContextListItem>;

registerEntity<ContextListItem>("context", {
  list: {
    columns: ContextListTable.columns,
    emptyMessage: "No context packages installed",
  },
});

export const handleListContext = Effect.fn("ListContext.handle")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const configured = yield* ws.getConfiguredContextEntries();
  const locked = yield* ws.getLockedContext();
  const names = [...new Set([...Object.keys(configured), ...Object.keys(locked)])].sort();
  const items = names.map((name) => ({
    name,
    enabled: configured[name]?.enabled ?? true,
    source: configured[name]?.source ?? "",
    locked: locked[name] !== undefined,
  }));

  if (yield* renderer.list("context", { items, count: items.length })) return;
  if (items.length === 0) {
    yield* renderer.info("No context packages installed");
    return;
  }
  yield* renderer.table(items, ContextListTable, "Installed context packages");
});

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription(
      "List context packages from project (default) or user-level configuration",
    ),
  ),
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope }) =>
  handleListContext().pipe(withWorkspace(scope), withRuntime("context list")),
).pipe(
  withArgvTracking(listConfig),
  Command.withAlias("ls"),
  Command.withDescription("List installed context packages"),
  Command.withExamples([
    {
      command: "axm context list",
      description: "List installed context packages",
    },
  ]),
);

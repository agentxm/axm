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

interface HookListItem {
  readonly name: string;
  readonly enabled: boolean;
  readonly source: string;
  readonly locked: boolean;
}

const HookListTable = {
  columns: {
    name: { header: "Name" },
    enabled: { header: "Status", render: (value: boolean) => (value ? "enabled" : "disabled") },
    source: { header: "Source" },
    locked: { header: "Locked", render: (value: boolean) => (value ? "yes" : "no") },
  },
} as const satisfies TableView<HookListItem>;

registerEntity<HookListItem>("hooks", {
  list: {
    columns: HookListTable.columns,
    emptyMessage: "No hooks packages installed",
  },
});

export const handleListHook = Effect.fn("ListHook.handle")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const configured = yield* ws.getConfiguredHookEntries();
  const locked = yield* ws.getLockedHooks();
  const names = [...new Set([...Object.keys(configured), ...Object.keys(locked)])].sort();
  const items = names.map((name) => ({
    name,
    enabled: configured[name]?.enabled ?? true,
    source: configured[name]?.source ?? "",
    locked: locked[name] !== undefined,
  }));

  if (yield* renderer.list("hooks", { items, count: items.length })) return;
  if (items.length === 0) {
    yield* renderer.info("No hooks packages installed");
    return;
  }
  yield* renderer.table(items, HookListTable, "Installed hooks packages");
});

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List hooks packages from project (default) or user-level configuration"),
  ),
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope }) =>
  handleListHook().pipe(withWorkspace(scope), withRuntime("hooks list")),
).pipe(
  withArgvTracking(listConfig),
  Command.withAlias("ls"),
  Command.withDescription("List installed hooks packages"),
  Command.withExamples([
    {
      command: "axm hooks list",
      description: "List installed hooks packages",
    },
  ]),
);

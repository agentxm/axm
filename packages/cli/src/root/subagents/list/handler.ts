import * as Effect from "effect/Effect";
import {
  CliRenderer,
  registerEntity,
  type TableView,
} from "@agentxm/client-core/unstable/cli-renderer";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { INSTALL_SUBAGENT_FROM_REGISTRY } from "../../suggested-actions.js";

export interface ListSubagentsHandlerArgs {
  readonly agents: readonly string[];
}

interface SubagentListItem {
  readonly name: string;
  readonly lifecycle: string;
  readonly enabled: boolean;
  readonly agents: ReadonlyArray<string>;
}

const SubagentListTable = {
  columns: {
    name: { header: "Name" },
    lifecycle: { header: "Lifecycle" },
    enabled: {
      header: "Status",
      render: (value: boolean) => (value ? "enabled" : "disabled"),
    },
    agents: {
      header: "Agents",
      render: (value: ReadonlyArray<string>) =>
        value.length === 0 ? "all configured agents" : value.join(", "),
    },
  },
} as const satisfies TableView<SubagentListItem>;

registerEntity<SubagentListItem>("subagent", {
  list: {
    columns: SubagentListTable.columns,
    emptyMessage: "No subagents installed",
    singularLabel: "installed subagent",
    pluralLabel: "installed subagents",
  },
});

export const handleListSubagents = Effect.fn("ListSubagents.handle")(function* (
  args: ListSubagentsHandlerArgs,
) {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;

  // getInstalledSubagents returns configured (direct) + implicit (transitive/pack-provided).
  const subagents = yield* ws.records.getInstalledSubagents();
  const lockedSubagents = yield* ws.getLockedSubagents();
  const entries = Object.entries(subagents);
  const filteredEntries =
    args.agents.length === 0
      ? entries
      : entries.filter(([name]) =>
          args.agents.some((agent) => (lockedSubagents[name]?.agents ?? []).includes(agent)),
        );

  const items = filteredEntries.map(([name, entry]) => ({
    name,
    lifecycle: entry.lifecycle,
    enabled: entry.enabled,
    agents: lockedSubagents[name]?.agents ?? [],
  }));

  if (
    yield* renderer.list("subagent", {
      items,
      count: items.length,
      emptyMessage:
        args.agents.length === 0
          ? "No subagents installed"
          : "No subagents matched the selected agent filter.",
      suggestions:
        items.length === 0 && args.agents.length === 0 ? [INSTALL_SUBAGENT_FROM_REGISTRY] : [],
    })
  ) {
    return;
  }

  if (filteredEntries.length === 0) return;

  yield* renderer.table(items, SubagentListTable, "Installed subagents");
});

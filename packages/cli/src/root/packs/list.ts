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
import { INSTALL_PACK_FROM_REGISTRY } from "../suggested-actions.js";

interface PackListItem {
  readonly name: string;
  readonly owner: string;
  readonly version: string;
  readonly source: string;
}

const PackListTable = {
  columns: {
    name: { header: "Name" },
    owner: { header: "Owner" },
    version: { header: "Version" },
    source: { header: "Source" },
  },
} as const satisfies TableView<PackListItem>;

registerEntity<PackListItem>("pack", {
  list: {
    columns: PackListTable.columns,
    emptyMessage: "No packs installed",
    singularLabel: "installed pack",
    pluralLabel: "installed packs",
  },
});

export const handleList = Effect.fn("PacksList.handle")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const packs = yield* ws.getLockedPacks();

  const items: ReadonlyArray<PackListItem> = Object.entries(packs).map(([name, entry]) => ({
    name,
    owner: entry.owner,
    version: entry.type === "workspace" ? entry.version : entry.resolvedVersion,
    source: entry.type === "workspace" ? "workspace" : entry.sourceName,
  }));

  if (
    yield* renderer.list("pack", {
      items,
      count: items.length,
      suggestions: items.length === 0 ? [INSTALL_PACK_FROM_REGISTRY] : [],
    })
  ) {
    return;
  }

  if (items.length === 0) return;

  yield* renderer.table(items, PackListTable, "Installed packs");
});

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List packs from project (default) or user-level configuration"),
  ),
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope }) =>
  handleList().pipe(withWorkspace(scope), withRuntime("packs list")),
).pipe(
  withArgvTracking(listConfig),
  Command.withAlias("ls"),
  Command.withDescription("List installed packs"),
  Command.withExamples([
    { command: "axm packs list", description: "See what packs are installed" },
    {
      command: "axm packs list --scope user",
      description: "Check user-level packs",
    },
  ]),
);

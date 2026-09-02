import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { Screen, inventoryDoc, type ViewColumn } from "../../screen/index.js";
import {
  ExtensionInventorySchema,
  WorkspaceMutations,
  type ConfiguredAgentOutcome,
} from "@agentxm/workspace-state";
import {
  parseExtensionFqnParts,
  parseSourceQualifiedRegistrySourcePatternParts,
} from "@agentxm/extension-model/unstable/extensions";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  augmentInventory,
  inventoryState,
  inventoryAgentOutcomes,
  inventorySummary,
} from "../extension-inventory.js";

interface PackListItem {
  readonly name: string;
  readonly state: string;
  readonly owner: string;
  readonly version: string;
  readonly source: string;
  readonly agentOutcomes: ReadonlyArray<ConfiguredAgentOutcome>;
}

const PackListColumns = [
  { header: "Name", value: (row: PackListItem) => row.name },
  { header: "State", value: (row: PackListItem) => row.state },
  { header: "Owner", value: (row: PackListItem) => row.owner },
  { header: "Version", value: (row: PackListItem) => row.version },
  { header: "Source", value: (row: PackListItem) => row.source },
  {
    header: "Agent outcomes",
    value: (row: PackListItem) => inventoryAgentOutcomes(row.agentOutcomes),
  },
] satisfies ReadonlyArray<ViewColumn<PackListItem>>;

export const handleList = Effect.fn("PacksList.handle")(function* () {
  const screen = yield* Screen;
  const ws = yield* WorkspaceMutations;
  const inventory = yield* ws.records.getExtensionInventory("pack", {});
  const packs = yield* ws.getLockedPacks();

  const items: ReadonlyArray<PackListItem> = inventory.items.map((row) => {
    const entry = packs[row.name];
    const configuredSource = row.source ?? row.origins.join(", ");
    const parsedRegistrySource = parseSourceQualifiedRegistrySourcePatternParts(configuredSource);
    const parsedWorkspaceSource = parseExtensionFqnParts(
      configuredSource.replace(/^workspace:/u, "").replace(/@[^@/]+$/u, ""),
    );
    return {
      name: row.name,
      state: inventoryState(row),
      owner: entry?.owner ?? parsedRegistrySource?.owner ?? parsedWorkspaceSource?.owner ?? "n/a",
      version: entry?.resolvedVersion ?? "n/a",
      source: configuredSource.startsWith("workspace:")
        ? "workspace"
        : (entry?.sourceName ?? configuredSource),
      agentOutcomes: row.agentOutcomes,
    };
  });
  const details = new Map(items.map((item) => [item.name, item]));
  const output = augmentInventory(inventory, (row) => {
    const item = details.get(row.name);
    return {
      owner: item?.owner ?? "n/a",
      version: item?.version ?? "n/a",
      source: item?.source ?? row.origins.join(", "),
    };
  });

  if (yield* screen.document(output, ExtensionInventorySchema)) return;
  yield* screen.result(
    inventoryDoc({
      rows: items,
      columns: PackListColumns,
      summary: inventorySummary(inventory, "pack"),
      empty: "No packs found",
    }),
  );
});

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List packs from project (default) or user-level configuration"),
  ),
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope }) =>
  handleList().pipe(withWorkspace({ scope, allowUninitialized: true }), withRuntime("packs list")),
).pipe(
  withArgvTracking(listConfig),
  Command.withDescription("List detected packs and their lifecycle classification"),
  Command.withExamples([
    { command: "axm packs list", description: "Inventory detected packs" },
    {
      command: "axm packs list --scope user",
      description: "Check user-level packs",
    },
  ]),
);

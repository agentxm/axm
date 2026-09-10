import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { Screen, inventoryDoc, type ViewColumn } from "../../screen/index.js";
import { ExtensionInventorySchema } from "@agentxm/workspace-state";
import { listPacks, type PackListRow } from "@agentxm/workspace-inspection";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import { inventoryAgentOutcomes, inventoryLifecycle, inventorySummary } from "../inventory-view.js";

const PackListColumns = [
  { header: "Name", priority: "required", value: (row: PackListRow) => row.name },
  { header: "State", value: (row: PackListRow) => inventoryLifecycle(row) },
  { header: "Owner", value: (row: PackListRow) => row.owner },
  { header: "Version", value: (row: PackListRow) => row.version },
  { header: "Source", value: (row: PackListRow) => row.source },
  {
    header: "Agent outcomes",
    priority: "optional",
    value: (row: PackListRow) => inventoryAgentOutcomes(row.agentOutcomes),
  },
] satisfies ReadonlyArray<ViewColumn<PackListRow>>;

export const handleList = Effect.fn("PacksList.handle")(function* () {
  const screen = yield* Screen;
  const { inventory, rows } = yield* listPacks();
  if (yield* screen.document(inventory, ExtensionInventorySchema)) return;
  yield* screen.result(
    inventoryDoc({
      rows,
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
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("List detected packs and their lifecycle classification"),
  Command.withExamples([
    { command: "axm packs list", description: "Inventory detected packs" },
    {
      command: "axm packs list --scope user",
      description: "Check user-level packs",
    },
  ]),
);

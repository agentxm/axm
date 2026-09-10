import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { Screen, inventoryDoc, type ViewColumn } from "../../screen/index.js";
import { ExtensionInventorySchema } from "@agentxm/workspace-state";
import { listHooks, type SourcedListRow } from "@agentxm/workspace-inspection";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import {
  inventoryActivation,
  inventoryAgentOutcomes,
  inventoryLifecycle,
  inventorySummary,
} from "../inventory-view.js";

const HookListColumns = [
  { header: "Name", priority: "required", value: (row: SourcedListRow) => row.name },
  { header: "State", value: (row: SourcedListRow) => inventoryLifecycle(row) },
  { header: "Activation", value: (row: SourcedListRow) => inventoryActivation(row) },
  { header: "Source", value: (row: SourcedListRow) => row.source },
  {
    header: "Locked",
    priority: "optional",
    value: (row: SourcedListRow) => (row.locked ? "yes" : "no"),
  },
  {
    header: "Agent outcomes",
    priority: "optional",
    value: (row: SourcedListRow) => inventoryAgentOutcomes(row.agentOutcomes),
  },
] satisfies ReadonlyArray<ViewColumn<SourcedListRow>>;

export const handleListHook = Effect.fn("ListHook.handle")(function* () {
  const screen = yield* Screen;
  const { inventory, rows } = yield* listHooks();
  if (yield* screen.document(inventory, ExtensionInventorySchema)) return;
  yield* screen.result(
    inventoryDoc({
      rows,
      columns: HookListColumns,
      summary: inventorySummary(inventory, "hooks package"),
      empty: "No hooks packages found",
    }),
  );
});

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List hooks packages from project (default) or user-level configuration"),
  ),
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope }) =>
  handleListHook().pipe(
    withWorkspace({ scope, allowUninitialized: true }),
    withRuntime("hooks list"),
  ),
).pipe(
  withArgvTracking(listConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("List detected hooks packages and their lifecycle classification"),
  Command.withExamples([
    {
      command: "axm hooks list",
      description: "Inventory detected hooks packages",
    },
  ]),
);

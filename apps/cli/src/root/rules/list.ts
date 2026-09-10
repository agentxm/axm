import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { Screen, inventoryDoc, type ViewColumn } from "../../screen/index.js";
import { ExtensionInventorySchema } from "@agentxm/workspace-state";
import { listRules, type SourcedListRow } from "@agentxm/workspace-inspection";
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

const RuleListColumns = [
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

export const handleListRule = Effect.fn("ListRule.handle")(function* () {
  const screen = yield* Screen;
  const { inventory, rows } = yield* listRules();
  if (yield* screen.document(inventory, ExtensionInventorySchema)) return;
  yield* screen.result(
    inventoryDoc({
      rows,
      columns: RuleListColumns,
      summary: inventorySummary(inventory, "rule"),
      empty: "No rules found",
    }),
  );
});

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List rules from project (default) or user-level configuration"),
  ),
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope }) =>
  handleListRule().pipe(
    withWorkspace({ scope, allowUninitialized: true }),
    withRuntime("rules list"),
  ),
).pipe(
  withArgvTracking(listConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("List detected rules and their lifecycle classification"),
  Command.withExamples([
    {
      command: "axm rules list",
      description: "Inventory detected rules",
    },
  ]),
);

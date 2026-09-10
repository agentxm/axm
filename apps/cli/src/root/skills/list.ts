import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { Screen, inventoryDoc, type ViewColumn } from "../../screen/index.js";
import { ExtensionInventorySchema } from "@agentxm/workspace-state";
import { listSkills, type SkillListRow } from "@agentxm/workspace-inspection";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { agentFlag } from "../../cli-flags/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  inventoryActivation,
  inventoryAgentOutcomes,
  inventoryLifecycle,
  inventorySummary,
} from "../inventory-view.js";

export interface ListHandlerArgs {
  readonly agents: readonly string[];
}

const SkillListColumns = [
  { header: "Name", priority: "required", value: (row: SkillListRow) => row.name },
  { header: "State", value: (row: SkillListRow) => inventoryLifecycle(row) },
  { header: "Activation", value: (row: SkillListRow) => inventoryActivation(row) },
  { header: "Type", priority: "optional", value: (row: SkillListRow) => row.sourceType },
  {
    header: "Agents",
    value: (row: SkillListRow) => (row.agents.length === 0 ? "none" : row.agents.join(", ")),
  },
  {
    header: "Agent outcomes",
    priority: "optional",
    value: (row: SkillListRow) => inventoryAgentOutcomes(row.agentOutcomes),
  },
] satisfies ReadonlyArray<ViewColumn<SkillListRow>>;

export const handleList = Effect.fn("List.handle")(function* (args: ListHandlerArgs) {
  const screen = yield* Screen;
  const { inventory, rows } = yield* listSkills({ agents: args.agents });
  if (yield* screen.document(inventory, ExtensionInventorySchema)) return;
  yield* screen.result(
    inventoryDoc({
      rows,
      columns: SkillListColumns,
      summary: inventorySummary(inventory, "skill"),
      empty:
        args.agents.length === 0
          ? "No skills found"
          : "No skills matched the selected agent filter.",
    }),
  );
});

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List skills from project (default) or user-level configuration"),
  ),
  agent: agentFlag.pipe(Flag.withDescription("Show only skills detected for specific agents")),
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope, agent }) =>
  handleList({ agents: agent }).pipe(
    withWorkspace({ scope, allowUninitialized: true }),
    withRuntime("skills list"),
  ),
).pipe(
  withArgvTracking(listConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("List detected skills and their lifecycle classification"),
  Command.withExamples([
    { command: "axm skills list", description: "Inventory detected skills" },
    {
      command: "axm skills list --scope user",
      description: "Check user-level skills",
    },
    {
      command: "axm skills list --agent claude-code",
      description: "See skills for a specific agent",
    },
  ]),
);

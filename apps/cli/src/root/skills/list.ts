import { listSkills, type SkillListRow } from "@agentxm/workspace/inspection";
import { type ViewColumn } from "../../screen/index.js";
import {
  inventoryActivation,
  inventoryAgentOutcomes,
  inventoryLifecycle,
} from "../inventory-view.js";
import { inventoryList, makePerTypeListCommand } from "../shared/list-command.js";

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

const { handler, command } = makePerTypeListCommand({
  type: "skill",
  ...inventoryList("skill", (agents) => listSkills({ agents })),
  columns: SkillListColumns,
  agentFilter: true,
});

export const handleList = handler;
export const listCommand = command;

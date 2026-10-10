import { listSkills, type SkillListRow } from "@agentxm/workspace-features/inspection";
import { type ViewColumn } from "../../screen/index.js";
import {
  inventoryActivation,
  inventoryAgentOutcomes,
  inventoryLifecycle,
} from "../inventory-view.js";
import { inventoryList, makePerTypeListCommand } from "../shared/list-command.js";

const SkillListColumns = [
  { header: "Name", priority: "required", value: (row: SkillListRow) => row.name },
  { header: "Management", value: (row: SkillListRow) => inventoryLifecycle(row) },
  { header: "Activation", value: (row: SkillListRow) => inventoryActivation(row) },
  { header: "Type", priority: "optional", value: (row: SkillListRow) => row.sourceType },
  {
    header: "Potential readers",
    priority: "optional",
    value: (row: SkillListRow) => (row.agents.length === 0 ? "none" : row.agents.join(", ")),
  },
  {
    header: "Configured agents",
    priority: "required",
    value: (row: SkillListRow) =>
      row.agentOutcomes.map((outcome) => outcome.agentId).join(", ") || "none",
  },
  {
    header: "Native locations",
    priority: "required",
    value: (row: SkillListRow) =>
      row.nativeLocations
        ?.map(
          (unit) =>
            `${unit.address.path}: ${unit.state}${unit.policyReasons.length === 0 ? "" : ` (${unit.policyReasons.join(", ")})`}`,
        )
        .join("; ") || "unverified",
  },
  {
    header: "Discovery",
    priority: "required",
    value: (row: SkillListRow) =>
      row.duplicateDiscoveries
        ?.map(
          (duplicate) =>
            `${duplicate.agentId} can discover this Skill in ${duplicate.nativeUnits.length} populated locations; native selection is unverified`,
        )
        .join("; ") || "native selection unverified",
  },
  {
    header: "Agent outcomes",
    priority: "required",
    value: (row: SkillListRow) => inventoryAgentOutcomes(row.agentOutcomes),
  },
] satisfies ReadonlyArray<ViewColumn<SkillListRow>>;

const { handler, command } = makePerTypeListCommand({
  type: "skill",
  ...inventoryList("skill", (agents) => listSkills({ agents })),
  columns: SkillListColumns,
});

export const handleList = handler;
export const listCommand = command;

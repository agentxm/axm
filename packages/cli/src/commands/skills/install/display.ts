/**
 * Plan display formatting for the install command.
 *
 * Formats execution plans for display to users, showing action labels,
 * skill names, and target agents in a consistent format.
 *
 * @example
 * ```typescript
 * const plan: Plan = {
 *   steps: [
 *     { _tag: "InstallSkill", skill: "commit", agents: ["claude", "cursor"] },
 *     { _tag: "UpdateSkill", skill: "review-pr", agents: ["claude"] },
 *   ],
 * };
 *
 * console.log(formatPlan(plan));
 * // Output:
 * //   (install) commit @ claude, cursor
 * //   (update) review-pr @ claude
 * //
 * //   1 skill to install, 1 skill to update across 2 agents
 * ```
 *
 * @experimental This API is unstable and may change without notice.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Plan step representing a skill installation action.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface InstallSkillStep {
  readonly _tag: "InstallSkill";
  readonly skill: string;
  readonly agents: readonly string[];
}

/**
 * Plan step representing a skill update action.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface UpdateSkillStep {
  readonly _tag: "UpdateSkill";
  readonly skill: string;
  readonly agents: readonly string[];
}

/**
 * Plan step representing a skill uninstall action.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface UninstallSkillStep {
  readonly _tag: "UninstallSkill";
  readonly skill: string;
  readonly agents: readonly string[];
}

/**
 * Discriminated union of all plan step types.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PlanStep = InstallSkillStep | UpdateSkillStep | UninstallSkillStep;

/**
 * Execution plan containing steps to be applied.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface Plan {
  readonly steps: readonly PlanStep[];
}

/**
 * Summary counts by action type.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface PlanSummary {
  readonly install: number;
  readonly update: number;
  readonly uninstall: number;
}

// =============================================================================
// Formatting Functions
// =============================================================================

/**
 * Get action label for display.
 *
 * @experimental This API is unstable and may change without notice.
 */
const getActionLabel = (tag: PlanStep["_tag"]): string => {
  switch (tag) {
    case "InstallSkill":
      return "install";
    case "UpdateSkill":
      return "update";
    case "UninstallSkill":
      return "uninstall";
  }
};

/**
 * Format a single plan step for display.
 *
 * Format: `(action) skill-name @ agent1, agent2, agent3`
 *
 * @experimental This API is unstable and may change without notice.
 */
export const formatPlanStep = (step: PlanStep): string => {
  const action = getActionLabel(step._tag);
  const agents = step.agents.join(", ");
  return `(${action}) ${step.skill} @ ${agents}`;
};

/**
 * Compute summary counts from plan steps.
 *
 * @experimental This API is unstable and may change without notice.
 */
const computeSummary = (steps: readonly PlanStep[]): PlanSummary => {
  let install = 0;
  let update = 0;
  let uninstall = 0;

  for (const step of steps) {
    switch (step._tag) {
      case "InstallSkill":
        install++;
        break;
      case "UpdateSkill":
        update++;
        break;
      case "UninstallSkill":
        uninstall++;
        break;
    }
  }

  return { install, update, uninstall };
};

/**
 * Count unique agents across all plan steps.
 *
 * @experimental This API is unstable and may change without notice.
 */
const countUniqueAgents = (steps: readonly PlanStep[]): number => {
  const agents = new Set<string>();
  for (const step of steps) {
    for (const agent of step.agents) {
      agents.add(agent);
    }
  }
  return agents.size;
};

/**
 * Format singular or plural form of "skill".
 *
 * @experimental This API is unstable and may change without notice.
 */
const pluralizeSkill = (count: number): string => (count === 1 ? "skill" : "skills");

/**
 * Format summary line for plan display.
 *
 * Format examples:
 * - "2 skills to install across 3 agents"
 * - "1 skill to update"
 * - "1 skill to install, 2 skills to update, 1 skill to uninstall"
 *
 * @param summary - Summary counts by action type
 * @param agentCount - Optional number of unique agents (omits suffix if 1 or undefined)
 *
 * @experimental This API is unstable and may change without notice.
 */
export const formatSummaryLine = (summary: PlanSummary, agentCount?: number): string => {
  const parts: string[] = [];

  if (summary.install > 0) {
    parts.push(`${summary.install} ${pluralizeSkill(summary.install)} to install`);
  }
  if (summary.update > 0) {
    parts.push(`${summary.update} ${pluralizeSkill(summary.update)} to update`);
  }
  if (summary.uninstall > 0) {
    parts.push(`${summary.uninstall} ${pluralizeSkill(summary.uninstall)} to uninstall`);
  }

  if (parts.length === 0) {
    return "No changes";
  }

  let result = parts.join(", ");

  // Add agent count suffix if more than one agent
  if (agentCount !== undefined && agentCount > 1) {
    result += ` across ${agentCount} agents`;
  }

  return result;
};

/**
 * Format a complete plan for display.
 *
 * Returns a formatted string showing all plan steps with indentation,
 * followed by a blank line and a summary line.
 *
 * @example
 * ```
 *   (install) commit @ claude, cursor, codex
 *   (install) review-pr @ claude, cursor, codex
 *
 *   2 skills to install across 3 agents
 * ```
 *
 * @experimental This API is unstable and may change without notice.
 */
export const formatPlan = (plan: Plan): string => {
  if (plan.steps.length === 0) {
    return "  No changes";
  }

  const stepLines = plan.steps.map((step) => `  ${formatPlanStep(step)}`);
  const summary = computeSummary(plan.steps);
  const agentCount = countUniqueAgents(plan.steps);
  const summaryLine = `  ${formatSummaryLine(summary, agentCount)}`;

  return `${stepLines.join("\n")}\n\n${summaryLine}`;
};

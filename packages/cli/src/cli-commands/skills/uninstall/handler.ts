/**
 * Uninstall command handler - Effect-based orchestration for `axm skills uninstall`.
 *
 * Uses taxonomy lifecycle views and plan-based reconciliation:
 * 1. Load installed skills and locked state
 * 2. Build InstalledSkills lookup with pack references
 * 3. Expand glob pattern against installed skill names (excludes ignored)
 * 4. Build UninstallSkillOperations
 * 5. Build plan (diff against installed state)
 * 6. Resolve plan via workspace (display, confirm, apply based on flags)
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Log } from "../../../tui/index.js";
import { Workspace } from "../../../workspace/index.js";
import type { UninstallSkillOperation } from "../../../extensions/skills/operations/uninstall.js";
import { buildSkillUninstallPlan, type InstalledSkills } from "./plan.js";
import { expandGlob } from "../../../skills/index.js";
import { uninstallSkill } from "../../../extensions/skills/operations/uninstall.js";
import { getSkillFqn, getReferencingPacks } from "../../../extensions/skills/utils.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the uninstall handler.
 */
export interface UninstallHandlerArgs {
  /** Name or glob pattern of the skill to uninstall */
  readonly skill: string;
  /** Target agent(s) to uninstall from (empty = all agents) */
  readonly agent: readonly string[];
  /** Skip confirmations */
  readonly yes: boolean;
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm skills uninstall` command.
 *
 * Flow (taxonomy-driven architecture):
 * 1. Load installed skills (taxonomy: configured ∪ implicit) and locked state
 * 2. Build InstalledSkills lookup with pack references using locked entries
 * 3. Expand glob pattern against installed skill names (excludes ignored)
 * 4. Build UninstallSkillOperations
 * 5. Build plan (diff against installed state)
 * 6. Resolve plan via workspace (display, confirm, apply based on flags)
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleUninstall = Effect.fn("Uninstall.handle")(function* (
  args: UninstallHandlerArgs,
) {
  const ws = yield* Workspace;
  const log = yield* Log;

  yield* log.info("axm skills uninstall");

  // Step 1: Load taxonomy installed skills and locked state
  const taxonomyInstalled = yield* ws.getInstalledSkills();
  const lockedSkills = yield* ws.getLockedSkills();
  const lockedPacks = yield* ws.getLockedPacks();

  // Step 2: Build InstalledSkills lookup from locked entries (for pack reference checks)
  const installed: InstalledSkills = Object.fromEntries(
    Object.keys(taxonomyInstalled).map((name) => {
      const lockEntry = lockedSkills[name];
      const fqn = lockEntry !== undefined ? getSkillFqn(name, lockEntry) : undefined;
      const packs = fqn !== undefined ? getReferencingPacks(fqn, lockedPacks) : [];
      return [name, { referencingPacks: packs }];
    }),
  );

  // Step 3: Expand glob pattern against installed skill names (excludes ignored)
  const installedNames = Object.keys(taxonomyInstalled);
  const skillNames = expandGlob(args.skill, installedNames);

  // Handle glob matching zero skills
  if (args.skill.includes("*") && skillNames.length === 0) {
    yield* log.warn(`No skills matched pattern "${args.skill}"`);
    yield* log.success("Nothing to uninstall.");
    return;
  }

  // For literal names not in installed set, still build an operation (plan marks as no-op)
  const names = skillNames.length > 0 ? skillNames : [args.skill];

  // Step 4: Build operations
  const ops = names.map(
    (name) =>
      ({
        name: "uninstall-skill",
        args: {
          skillName: name,
          agents: args.agent,
        },
      }) satisfies UninstallSkillOperation,
  );

  // Step 5: Build plan
  const plan = buildSkillUninstallPlan(ops, installed, "Uninstall skill(s)", Option.none());

  // Step 6: Resolve plan via workspace
  yield* ws.resolvePlan(plan, { "uninstall-skill": uninstallSkill });

  yield* log.success("Done");
});

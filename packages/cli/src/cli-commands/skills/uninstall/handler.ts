/**
 * Uninstall command handler - Effect-based orchestration for `axm skills uninstall`.
 *
 * Uses plan-based reconciliation pattern:
 * 1. Load lockfile
 * 2. Expand glob pattern against lockfile keys
 * 3. Build UninstallSkillOperations
 * 4. Build plan (diff against lockfile)
 * 5. Resolve plan via workspace (display, confirm, apply based on flags)
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Log } from "../../../tui/index.js";
import { Workspace as Workspace } from "../../../workspace/index.js";
import type { UninstallSkillOperation } from "../operations.js";
import { buildPlan } from "./build-plan.js";
import { expandGlob } from "../../../skills/index.js";
import { uninstallSkill } from "./uninstall-skill.js";

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
 * Flow (state-based architecture):
 * 1. Load lockfile from workspace
 * 2. Expand glob pattern against lockfile skill names
 * 3. Build UninstallSkillOperations
 * 4. Build plan (diff against lockfile)
 * 5. Resolve plan via workspace (display, confirm, apply based on flags)
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleUninstall = (args: UninstallHandlerArgs) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const log = yield* Log;

    yield* log.info("axm skills uninstall");

    // Check if the target is an unmanaged skill (bypass plan system entirely)
    if (!args.skill.includes("*")) {
      const configuredSkills = yield* ws.getConfiguredSkills();
      const entry = configuredSkills[args.skill];
      if (entry !== undefined && !entry.managed) {
        yield* ws.removeSkill(args.skill);
        yield* log.info(`Removed unmanaged skill marker '${args.skill}'`);
        yield* log.success("Done");
        return;
      }
    }

    // Step 1: Load lockfile
    const lockedSkills = yield* ws.getLockedSkills();
    const lockfile = { lockfileVersion: 1, skills: lockedSkills };

    // Step 2: Expand glob pattern
    const skillNames = expandGlob(args.skill, Object.keys(lockfile.skills));

    // Handle glob matching zero skills
    if (args.skill.includes("*") && skillNames.length === 0) {
      yield* log.warn(`No skills matched pattern "${args.skill}"`);
      yield* log.success("Nothing to uninstall.");
      return;
    }

    // For literal names not in lockfile, still build an operation (plan marks as no-op)
    const names = skillNames.length > 0 ? skillNames : [args.skill];

    // Step 3: Build operations
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

    // Step 4: Build plan
    const plan = buildPlan(ops, lockfile, "Uninstall skill(s)", Option.none());

    // Step 5: Resolve plan via workspace
    yield* ws.resolvePlan(plan, { "uninstall-skill": uninstallSkill });

    yield* log.success("Done");
  }).pipe(Effect.withSpan("Uninstall.handle"));

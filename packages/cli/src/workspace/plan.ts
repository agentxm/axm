/**
 * Build plan module for workspace skills reconciliation.
 *
 * Computes the execution plan by diffing current vs ideal state.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import { versionsEqual } from "../extensions/skills/state/pure-functions.js";
import type {
  CurrentState,
  IdealState,
  LockedSkillV2,
  Plan,
  PlanStep,
} from "../extensions/skills/state/types.js";

// =============================================================================
// Summary Types
// =============================================================================

/**
 * Summary of plan step counts by type.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface PlanSummary {
  readonly installed: number;
  readonly updated: number;
  readonly uninstalled: number;
}

/**
 * Build execution plan by diffing current vs ideal state.
 *
 * This is a pure function - no validation, just diffing.
 *
 * Matching strategy: Skills are matched by name (unique across all sources).
 * - Install/update: iterate ideal skills, find matching current skill by name
 * - Uninstall: iterate current skills, check if name exists in ideal
 *
 * Update detection depends on source type:
 * - Registry sources: compare version using versionsEqual
 * - Git sources: compare gitTreeHash
 * - Local sources: always update (no stable identifier)
 *
 * Uninstall only happens for skills that have both actual (on disk) and locked
 * (in lockfile) states. Skills that are "locked but not on disk" are health
 * issues (MissingFromDisk), not uninstall targets.
 *
 * @param current - Current workspace state
 * @param ideal - Desired state after operation
 * @returns Plan with steps to transform current to ideal
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildPlan = (current: CurrentState, ideal: IdealState): Plan => {
  // Find skills to install or update
  const installOrUpdateSteps = pipe(
    ideal.skills,
    Arr.filterMap((idealSkill) => {
      // Match by name - skill names are unique across all sources
      const currentSkill = pipe(
        current.skills,
        Arr.findFirst((s) => s.name === idealSkill.name),
      );

      return pipe(
        currentSkill,
        Option.match({
          onNone: () =>
            // Not in current state -> install
            Option.some<PlanStep>({
              _tag: "InstallSkill",
              skill: idealSkill.name,
              source: idealSkill.source,
              version: idealSkill.version,
              gitTreeHash: idealSkill.gitTreeHash,
              agents: idealSkill.agents,
            }),
          onSome: (cs) =>
            pipe(
              cs.locked,
              Option.match({
                onNone: () =>
                  // Skill exists in current but not in lockfile (orphaned) -> install
                  Option.some<PlanStep>({
                    _tag: "InstallSkill",
                    skill: idealSkill.name,
                    source: idealSkill.source,
                    version: idealSkill.version,
                    gitTreeHash: idealSkill.gitTreeHash,
                    agents: idealSkill.agents,
                  }),
                onSome: (locked) => {
                  // Determine if update is needed based on source type
                  const needsUpdate = determineNeedsUpdate(idealSkill, locked);

                  return needsUpdate
                    ? Option.some<PlanStep>({
                        _tag: "UpdateSkill",
                        skill: idealSkill.name,
                        source: idealSkill.source,
                        fromVersion: locked.version,
                        toVersion: idealSkill.version,
                        fromHash: locked.gitTreeHash,
                        toHash: idealSkill.gitTreeHash,
                        agents: idealSkill.agents,
                      })
                    : Option.none();
                },
              }),
            ),
        }),
      );
    }),
  );

  // Find skills to uninstall (in current but not in ideal)
  // Match by name - consistent with install/update matching
  const uninstallSteps = pipe(
    current.skills,
    Arr.filterMap((currentSkill) =>
      pipe(
        Option.all([currentSkill.actual, currentSkill.locked]),
        Option.flatMap(([, locked]) => {
          const inIdeal = pipe(
            ideal.skills,
            Arr.some((s) => s.name === currentSkill.name),
          );

          return inIdeal
            ? Option.none()
            : Option.some<PlanStep>({
                _tag: "UninstallSkill",
                skill: currentSkill.name,
                agents: locked.agents,
              });
        }),
      ),
    ),
  );

  const steps = Arr.appendAll(installOrUpdateSteps, uninstallSteps);
  return { steps };
};

/**
 * Determine if a skill needs to be updated based on its source type.
 *
 * @param idealSkill - The desired skill state
 * @param locked - The current locked skill state
 * @returns true if an update is needed
 */
const determineNeedsUpdate = (
  idealSkill: {
    readonly source: { readonly _tag: string };
    readonly version: Option.Option<string>;
    readonly gitTreeHash: Option.Option<string>;
  },
  locked: LockedSkillV2,
): boolean => {
  switch (idealSkill.source._tag) {
    case "Registry":
      // Registry: compare versions
      return !versionsEqual(idealSkill.version, locked.version);

    case "GitHub":
      // GitHub with hash: compare hashes, update if different
      // GitHub without hash (API unavailable): always update (no stable identifier)
      return pipe(
        Option.all([idealSkill.gitTreeHash, locked.gitTreeHash]),
        Option.match({
          onNone: () => true, // No hash available -> always update
          onSome: ([h1, h2]) => h1 !== h2, // Hashes differ -> update
        }),
      );

    case "Local":
      // Local: always update (no stable identifier)
      return true;

    default:
      // Unknown source type - update to be safe
      return true;
  }
};

// =============================================================================
// Plan Utility Functions
// =============================================================================

/**
 * Check if a plan has any changes to apply.
 *
 * Returns true if plan.steps.length > 0.
 * Replaces the legacy hasChanges(diff) function.
 *
 * @param plan - The execution plan to check
 * @returns true if there are steps to execute
 *
 * @experimental This API is unstable and may change without notice.
 */
export const planHasChanges = (plan: Plan): boolean => plan.steps.length > 0;

/**
 * Get summary counts from a plan.
 *
 * Returns counts of install, update, and uninstall steps.
 *
 * @param plan - The execution plan to summarize
 * @returns Summary with installed, updated, and uninstalled counts
 *
 * @experimental This API is unstable and may change without notice.
 */
export const getPlanSummary = (plan: Plan): PlanSummary => {
  let installed = 0;
  let updated = 0;
  let uninstalled = 0;

  for (const step of plan.steps) {
    switch (step._tag) {
      case "InstallSkill":
        installed++;
        break;
      case "UpdateSkill":
        updated++;
        break;
      case "UninstallSkill":
        uninstalled++;
        break;
    }
  }

  return { installed, updated, uninstalled };
};

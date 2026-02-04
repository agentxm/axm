/**
 * Diff computation for skills state - computes the plan between current and ideal state.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { Array as Arr, Option, pipe, Record } from "effect";
import {
  type IdealSkillsState,
  SkillChange,
  type SkillsDiff,
  type SkillsState,
  type SkillValidity,
} from "./types.js";

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Check if validity indicates the skill needs repair (not just warnings).
 * Uses exhaustive switch for pattern matching.
 */
const needsRepair = (validity: SkillValidity): boolean => {
  switch (validity._tag) {
    case "Valid":
    case "MissingDescription": // Warning only
      return false;
    case "MissingSkillMd":
    case "InvalidFrontmatter":
    case "NameMismatch":
    case "Orphaned":
    case "Missing":
    case "HashMismatch":
    case "Incomplete":
    case "Multiple":
      return true;
  }
};

// =============================================================================
// Public API
// =============================================================================

/**
 * Compute diff between current and ideal state.
 * This is the "plan" displayed in dry-run and executed in apply.
 *
 * Change types:
 * - Add: Skill in ideal but not in current
 * - Update: Skill in both but hash differs
 * - Remove: Skill in removals list
 * - Unchanged: Skill matches (or not in ideal at all)
 * - Repair: Skill has validity issues that need fixing
 *
 * @param current - Current skills state (actual + locked)
 * @param ideal - Desired skills state after operation
 * @returns SkillsDiff with changes and summary
 *
 * @experimental This API is unstable and may change without notice.
 */
export const computeDiff = (current: SkillsState, ideal: IdealSkillsState): SkillsDiff => {
  // Process removals
  const removalChanges = pipe(
    ideal.removals,
    Arr.filterMap((name) =>
      pipe(
        Option.fromNullable(current.skills[name]),
        Option.filter((state) => Option.isSome(state.actual)),
        Option.map((state) => [name, SkillChange.Remove({ skill: state })] as const),
      ),
    ),
  );

  // Process ideal skills
  const idealChanges = pipe(
    Record.toEntries(ideal.skills),
    Arr.map(([name, idealSkill]) => {
      const currentState = current.skills[name];

      // Not installed -> Add
      if (!currentState || Option.isNone(currentState.actual)) {
        return [name, SkillChange.Add({ skill: idealSkill })] as const;
      }

      // Invalid state -> Repair (unless it's orphaned, which needs special handling)
      if (needsRepair(currentState.validity) && currentState.validity._tag !== "Orphaned") {
        return [name, SkillChange.Repair({ skill: currentState, target: idealSkill })] as const;
      }

      // Hash differs -> Update
      const actualSkill = Option.getOrThrow(currentState.actual);
      if (actualSkill.gitTreeFolderHash !== idealSkill.gitTreeFolderHash) {
        return [name, SkillChange.Update({ from: currentState, to: idealSkill })] as const;
      }

      // Local sources with no hash (empty string) have no stable identifier.
      // We cannot verify the content is unchanged, so we treat this as Repair.
      // This ensures local sources are always refreshed on reinstall.
      if (actualSkill.gitTreeFolderHash === "" && idealSkill.gitTreeFolderHash === "") {
        return [name, SkillChange.Repair({ skill: currentState, target: idealSkill })] as const;
      }

      // Unchanged
      return [name, SkillChange.Unchanged({ skill: currentState })] as const;
    }),
  );

  // Combine changes into record
  const changes = Record.fromEntries([...removalChanges, ...idealChanges]);

  // Compute summary
  const summary = Object.values(changes).reduce(
    (acc, change) => {
      switch (change._tag) {
        case "Add":
          acc.add++;
          break;
        case "Update":
          acc.update++;
          break;
        case "Remove":
          acc.remove++;
          break;
        case "Unchanged":
          acc.unchanged++;
          break;
        case "Repair":
          acc.repair++;
          break;
      }
      return acc;
    },
    { add: 0, update: 0, remove: 0, unchanged: 0, repair: 0 },
  );

  return { changes, summary };
};

/**
 * Check if diff has any changes (add, update, remove, or repair).
 * Unchanged skills don't count as changes.
 *
 * @param diff - Skills diff to check
 * @returns True if there are changes to apply
 *
 * @experimental This API is unstable and may change without notice.
 */
export const hasChanges = (diff: SkillsDiff): boolean =>
  diff.summary.add > 0 ||
  diff.summary.update > 0 ||
  diff.summary.remove > 0 ||
  diff.summary.repair > 0;

/**
 * Get only the changes that need to be applied (excludes Unchanged).
 *
 * @param diff - Skills diff
 * @returns Array of [name, change] tuples for changes to apply
 *
 * @experimental This API is unstable and may change without notice.
 */
export const getChangesToApply = (
  diff: SkillsDiff,
): readonly (readonly [string, Exclude<(typeof diff.changes)[string], { _tag: "Unchanged" }>])[] =>
  pipe(
    Object.entries(diff.changes),
    Arr.filter(([_, change]) => change._tag !== "Unchanged"),
  ) as readonly (readonly [
    string,
    Exclude<(typeof diff.changes)[string], { _tag: "Unchanged" }>,
  ])[];

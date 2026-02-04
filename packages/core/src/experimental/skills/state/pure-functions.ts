/**
 * Pure functions for skills state management.
 *
 * These functions are pure (no side effects) and can be tested without effects.
 * They compute derived values from state without modifying anything.
 *
 * See docs/designs/dry-run.md for the reconciliation pattern.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { Array as Arr, Option, pipe } from "effect";
import * as semver from "semver";
import type {
  ActualSkillIssue,
  AnyIssue,
  SkillSourceV2,
  SkillStateIssue,
  WorkspaceIssue,
} from "./types.js";

/**
 * Skill source type re-exported from types.ts for convenience.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SkillSource = SkillSourceV2;

// =============================================================================
// Install Path Computation
// =============================================================================

/**
 * Compute install path from source type and skill name.
 *
 * Registry skills are installed to scoped directories:
 * `.axm/extensions/@<scope>/skills/<name>`
 *
 * External skills (GitHub, Local) are installed to a shared external directory:
 * `.axm/extensions/external/skills/<name>`
 *
 * @param source - The skill source (Registry, GitHub, or Local)
 * @param name - The skill name to use in the path
 * @returns The relative install path for the skill
 *
 * @example
 * ```typescript
 * import { Option } from "effect";
 *
 * // Registry source
 * const registrySource = {
 *   _tag: "Registry" as const,
 *   location: { _tag: "Remote" as const, url: "https://registry.example.com" },
 *   scope: "official",
 *   name: "commit",
 *   version: Option.some("1.0.0"),
 * };
 * computeInstallPath(registrySource, "commit");
 * // => ".axm/extensions/@official/skills/commit"
 *
 * // GitHub source
 * const githubSource = {
 *   _tag: "GitHub" as const,
 *   owner: "anthropics",
 *   repo: "skills",
 *   ref: Option.none(),
 *   path: Option.none(),
 * };
 * computeInstallPath(githubSource, "my-skill");
 * // => ".axm/extensions/external/skills/my-skill"
 * ```
 *
 * @experimental This API is unstable and may change without notice.
 */
export const computeInstallPath = (source: SkillSource, name: string): string => {
  switch (source._tag) {
    case "Registry":
      return `.axm/extensions/@${source.scope}/skills/${name}`;
    case "GitHub":
    case "Local":
      return `.axm/extensions/external/skills/${name}`;
  }
};

// =============================================================================
// Types for New Reconciliation Design
// =============================================================================

/**
 * ActualSkill with issues for the new reconciliation design.
 *
 * This extends the existing ActualSkill concept with an issues array
 * instead of the older validity pattern.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ActualSkillNew {
  readonly name: string;
  readonly path: string;
  readonly files: readonly string[];
  readonly frontmatter: Option.Option<{
    readonly name?: string;
    readonly description?: string;
    readonly version?: string;
    readonly triggers?: readonly string[];
  }>;
  readonly issues: readonly ActualSkillIssue[];
}

/**
 * SkillState with issues for the new reconciliation design.
 *
 * This combines actual skill (on disk) with locked skill (lockfile)
 * and computed issues from comparing them.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SkillStateNew {
  readonly name: string;
  readonly actual: Option.Option<ActualSkillNew>;
  readonly locked: Option.Option<unknown>; // LockedSkill from new design
  readonly issues: readonly SkillStateIssue[];
}

/**
 * Current workspace state for the new reconciliation design.
 *
 * Uses Array (not Record) to detect and report duplicate skill names on disk.
 * Duplicates are workspace-level errors (DuplicateName issue) that block operations.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface CurrentStateNew {
  readonly skills: readonly SkillStateNew[];
  readonly issues: readonly WorkspaceIssue[];
}

// Re-export issue types for convenience
export type { ActualSkillIssue, AnyIssue, SkillStateIssue, WorkspaceIssue };

// =============================================================================
// Issue Collection
// =============================================================================

/**
 * Collect all issues from current state into a flat array.
 *
 * Returns issues from all levels:
 * - CurrentState.issues (WorkspaceIssue[]) - workspace-level issues
 * - Each SkillState.issues (SkillStateIssue[]) - issues comparing actual vs locked
 * - Each ActualSkill.issues (ActualSkillIssue[]) - issues with skill on disk
 *
 * This is a pure function with no side effects.
 *
 * @param current - The current workspace state with issues at all levels
 * @returns Flattened array of all issues from all levels
 *
 * @example
 * ```typescript
 * import { Array, Option } from "effect";
 *
 * const current: CurrentStateNew = {
 *   skills: [
 *     {
 *       name: "my-skill",
 *       actual: Option.some({
 *         name: "my-skill",
 *         path: "/path",
 *         files: [],
 *         frontmatter: Option.none(),
 *         issues: [{ _tag: "MissingDescription", severity: "warning" }],
 *       }),
 *       locked: Option.none(),
 *       issues: [{ _tag: "NotInLockfile", name: "my-skill", severity: "warning" }],
 *     },
 *   ],
 *   issues: [],
 * };
 *
 * const allIssues = collectIssues(current);
 * // Returns: [
 * //   { _tag: "NotInLockfile", name: "my-skill", severity: "warning" },
 * //   { _tag: "MissingDescription", severity: "warning" },
 * // ]
 * ```
 *
 * @experimental This API is unstable and may change without notice.
 */
export const collectIssues = (current: CurrentStateNew): readonly AnyIssue[] =>
  pipe(
    current.skills,
    Arr.flatMap((s) =>
      Arr.appendAll(
        s.issues,
        pipe(
          s.actual,
          Option.map((a) => a.issues),
          Option.getOrElse(() => Arr.empty<ActualSkillIssue>()),
        ),
      ),
    ),
    Arr.appendAll(current.issues),
  );

// =============================================================================
// Settings Entry Conversion
// =============================================================================

/**
 * Settings entry for a skill.
 *
 * String form is shorthand for registry FQN (fully qualified name).
 * Object forms are used for other source types (GitHub, Local).
 *
 * Registry sources use the FQN shorthand format for simpler user-readable settings:
 * - Without version: `@scope/skill-name`
 * - With version: `@scope/skill-name@version`
 *
 * Full source details (like registry URL) are preserved in the lockfile.
 *
 * Note: Registry variants (FileSystemRegistry, RemoteRegistry) will be added
 * when registry infrastructure lands. For now, only GitHub and Local are supported
 * as non-string entries.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SkillSettingsEntry =
  | string // Registry FQN shorthand: "@scope/skill-name" or "@scope/skill-name@version"
  | {
      readonly _tag: "GitHub";
      readonly owner: string;
      readonly repo: string;
      readonly ref: Option.Option<string>;
      readonly path: Option.Option<string>;
    }
  | {
      readonly _tag: "Local";
      readonly path: string;
    };

/**
 * Convert SkillSource to settings entry.
 *
 * Uses FQN shorthand for registry sources (simpler for users to read).
 * Full source details are preserved in the lockfile.
 *
 * @param source - The skill source to convert
 * @returns The settings entry representation
 *
 * @example
 * ```typescript
 * import { Option } from "effect";
 *
 * // Registry source -> FQN string
 * const registrySource = {
 *   _tag: "Registry" as const,
 *   location: { _tag: "Remote" as const, url: "https://registry.example.com" },
 *   scope: "official",
 *   name: "commit",
 *   version: Option.some("1.0.0"),
 * };
 * toSettingsEntry(registrySource);
 * // => "@official/commit@1.0.0"
 *
 * // Registry source without version
 * const registryNoVersion = {
 *   _tag: "Registry" as const,
 *   location: { _tag: "Remote" as const, url: "https://registry.example.com" },
 *   scope: "my-org",
 *   name: "my-skill",
 *   version: Option.none(),
 * };
 * toSettingsEntry(registryNoVersion);
 * // => "@my-org/my-skill"
 *
 * // GitHub source -> object with _tag
 * const githubSource = {
 *   _tag: "GitHub" as const,
 *   owner: "anthropics",
 *   repo: "skills",
 *   ref: Option.some("main"),
 *   path: Option.some("skills/commit"),
 * };
 * toSettingsEntry(githubSource);
 * // => { _tag: "GitHub", owner: "anthropics", repo: "skills", ref: Option.some("main"), path: Option.some("skills/commit") }
 *
 * // Local source -> object with _tag
 * const localSource = { _tag: "Local" as const, path: "/path/to/skill" };
 * toSettingsEntry(localSource);
 * // => { _tag: "Local", path: "/path/to/skill" }
 * ```
 *
 * @experimental This API is unstable and may change without notice.
 */
export const toSettingsEntry = (source: SkillSource): SkillSettingsEntry => {
  switch (source._tag) {
    case "Registry":
      // Use FQN shorthand for registry sources
      return Option.match(source.version, {
        onNone: () => `@${source.scope}/${source.name}`,
        onSome: (v) => `@${source.scope}/${source.name}@${v}`,
      });
    case "GitHub":
      return {
        _tag: "GitHub",
        owner: source.owner,
        repo: source.repo,
        ref: source.ref,
        path: source.path,
      };
    case "Local":
      return { _tag: "Local", path: source.path };
  }
};

// =============================================================================
// Version Comparison
// =============================================================================

/**
 * Compare two optional version strings for equality.
 *
 * This function handles version comparison with the following logic:
 * - If both are None, they're equal (returns true)
 * - If one is None and one is Some, they're not equal (returns false)
 * - If both are Some, attempt semver comparison first:
 *   - If both parse as valid semver, use semver.eq() for comparison
 *   - If either fails to parse as semver, fall back to string equality
 *
 * This is useful for comparing versions from different source types:
 * - Registry sources use semver (e.g., "1.0.0", "2.1.0-beta.1")
 * - Git sources may use non-semver identifiers (e.g., git tree hashes)
 *
 * @param a - First optional version string
 * @param b - Second optional version string
 * @returns true if versions are equal, false otherwise
 *
 * @example
 * ```typescript
 * import { Option } from "effect";
 *
 * // Both None - equal
 * versionsEqual(Option.none(), Option.none()); // true
 *
 * // One None - not equal
 * versionsEqual(Option.some("1.0.0"), Option.none()); // false
 *
 * // Both valid semver - uses semver comparison
 * versionsEqual(Option.some("1.0.0"), Option.some("1.0.0")); // true
 * versionsEqual(Option.some("1.0.0+build1"), Option.some("1.0.0+build2")); // true (build metadata ignored)
 *
 * // Non-semver strings - falls back to string equality
 * versionsEqual(Option.some("abc123"), Option.some("abc123")); // true
 * versionsEqual(Option.some("abc123"), Option.some("def456")); // false
 * ```
 *
 * @experimental This API is unstable and may change without notice.
 */
export const versionsEqual = (a: Option.Option<string>, b: Option.Option<string>): boolean =>
  pipe(
    Option.all([a, b]),
    Option.match({
      onNone: () => Option.isNone(a) && Option.isNone(b),
      onSome: ([va, vb]) => {
        // Attempt semver comparison, fall back to string equality
        const parsedA = semver.parse(va);
        const parsedB = semver.parse(vb);
        return parsedA && parsedB ? semver.eq(parsedA, parsedB) : va === vb;
      },
    }),
  );

// =============================================================================
// Plan Types (for buildPlan)
// =============================================================================

/**
 * Skill source type for plan building.
 *
 * This is a simplified version of SkillSource focused on what buildPlan needs.
 * Uses `subpath` instead of `path` for GitHub sources to match the design doc.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SkillSourceNew =
  | { readonly _tag: "Registry"; readonly name: string; readonly version: string }
  | {
      readonly _tag: "GitHub";
      readonly owner: string;
      readonly repo: string;
      readonly ref: Option.Option<string>;
      readonly subpath: Option.Option<string>;
    }
  | { readonly _tag: "Local"; readonly path: string };

/**
 * Locked skill entry from lockfile (new design).
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface LockedSkillNew {
  readonly name: string;
  readonly source: SkillSourceNew;
  readonly version: Option.Option<string>;
  readonly gitTreeHash: Option.Option<string>;
  readonly agents: readonly string[];
  readonly installedAt: Date;
  readonly updatedAt: Date;
}

/**
 * Ideal skill state after operation (new design).
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface IdealSkillNew {
  readonly name: string;
  readonly source: SkillSourceNew;
  readonly version: Option.Option<string>;
  readonly gitTreeHash: Option.Option<string>;
  readonly agents: readonly string[];
}

/**
 * Ideal state - desired after the operation (new design).
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface IdealStateNew {
  readonly skills: readonly IdealSkillNew[];
}

/**
 * Plan step - install, update, or uninstall.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PlanStep =
  | {
      readonly _tag: "InstallSkill";
      readonly skill: string;
      readonly source: SkillSourceNew;
      readonly version: Option.Option<string>;
      readonly gitTreeHash: Option.Option<string>;
      readonly agents: readonly string[];
    }
  | {
      readonly _tag: "UpdateSkill";
      readonly skill: string;
      readonly source: SkillSourceNew;
      readonly fromVersion: Option.Option<string>;
      readonly toVersion: Option.Option<string>;
      readonly fromHash: Option.Option<string>;
      readonly toHash: Option.Option<string>;
      readonly agents: readonly string[];
    }
  | {
      readonly _tag: "UninstallSkill";
      readonly skill: string;
      readonly agents: readonly string[];
    };

/**
 * Execution plan - steps to apply.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface Plan {
  readonly steps: readonly PlanStep[];
}

// =============================================================================
// Build Plan
// =============================================================================

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
 * @param current - Current workspace state (actual + locked merged)
 * @param ideal - Desired state after operation
 * @returns Plan with steps to transform current to ideal
 *
 * @example
 * ```typescript
 * import { Option } from "effect";
 *
 * const current: CurrentStateNew = {
 *   skills: [{ name: "old-skill", actual: Option.some(...), locked: Option.some(...), issues: [] }],
 *   issues: [],
 * };
 * const ideal: IdealStateNew = {
 *   skills: [{ name: "new-skill", source: { _tag: "Local", path: "/path" }, ... }],
 * };
 *
 * const plan = buildPlan(current, ideal);
 * // plan.steps includes:
 * // - UninstallSkill for "old-skill" (in current but not ideal)
 * // - InstallSkill for "new-skill" (in ideal but not current)
 * ```
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildPlan = (current: CurrentStateNew, ideal: IdealStateNew): Plan => {
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
            // Not on disk -> install
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
              cs.locked as Option.Option<LockedSkillNew>,
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
                  const needsUpdate = (() => {
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
                    }
                  })();

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
        Option.all([currentSkill.actual, currentSkill.locked as Option.Option<LockedSkillNew>]),
        Option.flatMap(([_actual, locked]) => {
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

/**
 * Ideal state builders for skills - constructs desired state for operations.
 *
 * Each operation (install, update, uninstall, sync) has its own builder that
 * constructs the ideal state from the current state and operation parameters.
 *
 * This module uses two type systems:
 * - Legacy types (IdealSkillLegacy, SkillSource) - for existing install/uninstall/sync
 * - V2 types (IdealSkillV2, SkillSourceV2) - for new reconciliation design (update)
 *
 * Migration to fully use V2 types is planned for a future phase.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as nodePath from "node:path";
import type { FileSystem, Path } from "@effect/platform";
import { Array as Arr, Data, Effect, Option, pipe, Record } from "effect";

import { computeFolderHash } from "../folder-hash.js";
import { discoverSkills } from "../skill-discovery.js";
import type { ParsedSource, Skill } from "../types.js";
import {
  type CurrentState,
  type IdealSkillLegacy as IdealSkill,
  type IdealSkillsState,
  type IdealSkillV2,
  type IdealState,
  SkillSource,
  type SkillSourceV2,
  type SkillState,
  type SkillStateV2,
  type SkillsState,
} from "./types.js";

// =============================================================================
// Errors
// =============================================================================

/**
 * Error building ideal state.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class BuildIdealError extends Data.TaggedError("BuildIdealError")<{
  readonly message: string;
  readonly cause?: unknown;
  readonly retryable: boolean;
}> {}

// =============================================================================
// Types
// =============================================================================

/**
 * Options for building ideal state for install operation.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface InstallOptions {
  /** Install to global ~/.axm/ instead of local */
  readonly global: boolean;
  /** Target agent IDs */
  readonly agents: readonly string[];
  /** Force overwrite existing skills */
  readonly force: boolean;
  /** Specific skill names to install (empty = all) */
  readonly skills: readonly string[];
  /** Install all available skills */
  readonly all: boolean;
}

/**
 * Resolved source with skills directory path.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ResolvedSource {
  /** Parsed source information */
  readonly parsed: ParsedSource;
  /** Path to directory containing skills */
  readonly skillsDir: string;
  /** Git commit SHA (for git sources) */
  readonly commitSha?: string;
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Convert existing skill state to ideal representation.
 */
const stateToIdeal = (state: SkillState): IdealSkill =>
  Option.match(state.locked, {
    onNone: () => {
      // Orphaned skill - use actual data to build ideal
      const actual = Option.getOrThrow(state.actual);
      return {
        name: state.name,
        source: SkillSource.Local({ path: actual.path }),
        gitTreeFolderHash: actual.gitTreeFolderHash,
        description: pipe(
          actual.frontmatter,
          Option.flatMap((fm) => Option.fromNullable(fm.description)),
        ),
        agents: [],
      };
    },
    onSome: (locked) => ({
      name: state.name,
      source: SkillSource.Git({
        url: locked.source,
        ref: locked.ref,
        subpath: locked.path,
      }),
      gitTreeFolderHash: locked.gitTreeFolderHash,
      description: Option.none(),
      agents: [],
    }),
  });

/**
 * Convert discovered skill to ideal representation.
 */
const skillToIdeal = (
  skill: Skill,
  source: ResolvedSource,
  hash: string,
  agents: readonly string[],
): IdealSkill => {
  const skillSource =
    source.parsed.type === "github" ||
    source.parsed.type === "gitlab" ||
    source.parsed.type === "bitbucket" ||
    source.parsed.type === "git"
      ? SkillSource.Git({
          url: source.parsed.canonical,
          ref: Option.fromNullable(source.parsed.ref),
          subpath: Option.fromNullable(source.parsed.path),
        })
      : SkillSource.Local({ path: nodePath.dirname(skill.path) });

  return {
    name: skill.name,
    source: skillSource,
    gitTreeFolderHash: hash,
    description: Option.fromNullable(skill.description),
    agents: [...agents],
  };
};

// =============================================================================
// Public API
// =============================================================================

/**
 * Build ideal state for install operation.
 *
 * @param current - Current skills state
 * @param source - Resolved source with skills to install
 * @param options - Install options
 * @returns Effect yielding ideal skills state
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildIdealForInstall = (
  current: SkillsState,
  source: ResolvedSource,
  options: InstallOptions,
): Effect.Effect<IdealSkillsState, BuildIdealError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    // Discover skills from source
    const discovered = yield* discoverSkills(source.skillsDir).pipe(
      Effect.mapError(
        (error) =>
          new BuildIdealError({
            message: `Failed to discover skills: ${error.message}`,
            cause: error,
            retryable: false,
          }),
      ),
    );

    // Filter by --skill flag if provided
    const filtered =
      options.skills.length > 0
        ? pipe(
            discovered,
            Arr.filter((s: Skill) => options.skills.includes(s.name)),
          )
        : discovered;

    // Keep existing valid skills as ideal (unless they're being overwritten)
    const existingIdeal = pipe(
      Record.toEntries(current.skills),
      Arr.filter(([name, state]) => {
        // Keep if has both actual and locked, and not being replaced
        const hasActual = Option.isSome(state.actual);
        const hasLocked = Option.isSome(state.locked);
        const beingReplaced = filtered.some((s) => s.name === name);
        return hasActual && hasLocked && (!beingReplaced || !options.force);
      }),
      Arr.map(([name, state]) => [name, stateToIdeal(state)] as const),
      Record.fromEntries,
    );

    // Build ideal for new/updated skills from source
    const newIdealEntries = yield* pipe(
      filtered,
      // biome-ignore lint/suspicious/useIterableCallbackReturn: Effect.forEach is not Array.forEach
      Effect.forEach(
        (skill) =>
          Effect.gen(function* () {
            const existing = current.skills[skill.name];

            // Skip if exists and not forcing
            if (existing && Option.isSome(existing.actual) && !options.force) {
              return Option.none();
            }

            // Compute hash for the skill directory
            const skillDir = nodePath.dirname(skill.path);
            const hashResult = yield* computeFolderHash(skillDir).pipe(
              Effect.mapError(
                (error) =>
                  new BuildIdealError({
                    message: `Failed to compute hash for skill ${skill.name}`,
                    cause: error,
                    retryable: false,
                  }),
              ),
            );

            return Option.some([
              skill.name,
              skillToIdeal(skill, source, hashResult.hash, options.agents),
            ] as const);
          }),
        { concurrency: "unbounded" },
      ),
      Effect.map(Arr.getSomes),
    );

    const newIdeal = Record.fromEntries(newIdealEntries);

    return {
      skills: { ...existingIdeal, ...newIdeal },
      removals: [],
    };
  });

/**
 * Build ideal state for uninstall operation.
 *
 * @param current - Current skills state
 * @param skillNames - Names of skills to uninstall
 * @returns Effect yielding ideal skills state
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildIdealForUninstall = (
  current: SkillsState,
  skillNames: readonly string[],
): Effect.Effect<IdealSkillsState, BuildIdealError, never> =>
  Effect.succeed({
    // Keep skills not being uninstalled
    skills: pipe(
      Record.toEntries(current.skills),
      Arr.filter(([name, state]) => !skillNames.includes(name) && Option.isSome(state.locked)),
      Arr.map(([name, state]) => [name, stateToIdeal(state)] as const),
      Record.fromEntries,
    ),
    // Mark specified skills for removal
    removals: pipe(
      skillNames,
      Arr.filter((name) => name in current.skills),
    ),
  });

/**
 * Build ideal state for sync operation (repair drift).
 * Makes actual match locked state.
 *
 * @param current - Current skills state
 * @returns Effect yielding ideal skills state
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildIdealForSync = (
  current: SkillsState,
): Effect.Effect<IdealSkillsState, BuildIdealError, never> => {
  const entries = Record.toEntries(current.skills);

  return Effect.succeed({
    // Keep locked skills as ideal
    skills: pipe(
      entries,
      Arr.filter(([_, state]) => Option.isSome(state.locked)),
      Arr.map(([name, state]) => [name, stateToIdeal(state)] as const),
      Record.fromEntries,
    ),
    // Mark orphaned (actual but not locked) for removal
    removals: pipe(
      entries,
      Arr.filter(([_, state]) => Option.isNone(state.locked) && Option.isSome(state.actual)),
      Arr.map(([name]) => name),
    ),
  });
};

// =============================================================================
// V2 Types and Functions (new reconciliation design)
// =============================================================================

/**
 * Error for command validation failures.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class CommandError extends Data.TaggedError("CommandError")<{
  readonly message: string;
  readonly cause: Option.Option<unknown>;
}> {}

/**
 * Command type for skills-update operation.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SkillsUpdateCommand {
  readonly _tag: "skills-update";
  /** "all" to update all installed skills, or specific skill names */
  readonly skills: "all" | ReadonlyArray<string>;
}

/**
 * Result from fetching latest version information.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface LatestVersionResult {
  readonly version: Option.Option<string>;
  readonly gitTreeHash: Option.Option<string>;
}

/**
 * Function type for fetching latest version from a source.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type FetchLatestVersion = (
  source: SkillSourceV2,
) => Effect.Effect<LatestVersionResult, CommandError>;

/**
 * Check if skill name exists in current state.
 *
 * @experimental This API is unstable and may change without notice.
 */
const nameExistsV2 = (current: CurrentState, name: string): boolean =>
  pipe(
    current.skills,
    Arr.some((s) => s.name === name),
  );

/**
 * Convert current skill state (V2) to ideal representation.
 *
 * @experimental This API is unstable and may change without notice.
 */
const currentToIdealV2 = (skill: SkillStateV2): Option.Option<IdealSkillV2> =>
  pipe(
    skill.locked,
    Option.map((locked) => ({
      name: skill.name,
      source: locked.source,
      version: locked.version,
      gitTreeHash: locked.gitTreeHash,
      agents: locked.agents,
    })),
  );

/**
 * Build ideal state for update command.
 *
 * Algorithm:
 * 1. Determine skills to update ("all" or specific names)
 * 2. Validate requested skills exist
 * 3. Fetch latest version/hash from each skill's locked source
 * 4. Keep unchanged skills as-is
 * 5. Return ideal state with updated versions
 *
 * @param current - Current workspace state
 * @param cmd - Update command with skill names or "all"
 * @param fetchLatestVersion - Function to fetch latest version from source
 * @returns Effect yielding ideal state
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildIdealForUpdate = (
  current: CurrentState,
  cmd: SkillsUpdateCommand,
  fetchLatestVersion: FetchLatestVersion,
): Effect.Effect<IdealState, CommandError> =>
  Effect.gen(function* () {
    // Determine which skills to update
    const toUpdate =
      cmd.skills === "all"
        ? pipe(
            current.skills,
            Arr.filter((s) => Option.isSome(s.locked)),
          )
        : pipe(
            current.skills,
            Arr.filter(
              (s) =>
                (cmd.skills as ReadonlyArray<string>).includes(s.name) && Option.isSome(s.locked),
            ),
          );

    // Validate requested skills exist
    if (cmd.skills !== "all") {
      const notFound = pipe(
        cmd.skills as ReadonlyArray<string>,
        Arr.filter((name) => !nameExistsV2(current, name)),
      );
      if (Arr.isNonEmptyArray(notFound)) {
        return yield* new CommandError({
          message: `Skills not found: ${notFound.join(", ")}`,
          cause: Option.none(),
        });
      }
    }

    // Fetch latest versions for skills being updated
    const updated = yield* pipe(
      toUpdate,
      // biome-ignore lint/suspicious/useIterableCallbackReturn: Effect.forEach maps over array with effects
      Effect.forEach(
        (skill) =>
          Effect.gen(function* () {
            const locked = Option.getOrThrow(skill.locked); // Safe: filtered above
            const latest = yield* fetchLatestVersion(locked.source);
            return {
              name: skill.name,
              source: locked.source,
              version: latest.version,
              gitTreeHash: latest.gitTreeHash,
              agents: [...locked.agents],
            } satisfies IdealSkillV2;
          }),
        { concurrency: "inherit" },
      ),
    );

    // Keep skills not being updated
    const unchanged = pipe(
      current.skills,
      Arr.filter(
        (s) =>
          !pipe(
            toUpdate,
            Arr.some((u) => u.name === s.name),
          ),
      ),
      Arr.filterMap(currentToIdealV2),
    );

    return { skills: Arr.appendAll(unchanged, updated) };
  });

/**
 * Options for building ideal state for uninstall operation (V2).
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface UninstallOptionsV2 {
  /** Target agents to uninstall from. If empty or undefined, uninstall from all agents. */
  readonly agents?: ReadonlyArray<string>;
}

/**
 * Build ideal state for uninstall operation (V2 - new reconciliation design).
 *
 * Algorithm:
 * 1. Find the target skill in current state
 * 2. If agents specified, remove skill from only those agents
 * 3. If no agents specified, remove skill entirely
 * 4. If skill has no remaining agents after partial uninstall, remove entirely
 * 5. Keep all other skills unchanged
 *
 * @param current - Current workspace state (V2)
 * @param skillName - Name of skill to uninstall
 * @param options - Uninstall options (agents to uninstall from)
 * @returns Ideal state with skill removed/modified
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildIdealForUninstallV2 = (
  current: CurrentState,
  skillName: string,
  options?: UninstallOptionsV2,
): IdealState => {
  const targetAgents = options?.agents ?? [];
  const isPartialUninstall = targetAgents.length > 0;

  const skills = pipe(
    current.skills,
    // Only include skills with locked state (orphans are not in ideal)
    Arr.filter((s) => Option.isSome(s.locked)),
    Arr.filterMap((skill) => {
      const locked = Option.getOrThrow(skill.locked); // Safe: filtered above

      // Not the target skill - keep unchanged
      if (skill.name !== skillName) {
        return Option.some({
          name: skill.name,
          source: locked.source,
          version: locked.version,
          gitTreeHash: locked.gitTreeHash,
          agents: [...locked.agents],
        } satisfies IdealSkillV2);
      }

      // Target skill found
      if (!isPartialUninstall) {
        // Full uninstall - exclude from ideal state
        return Option.none();
      }

      // Partial uninstall - remove specified agents
      const remainingAgents = pipe(
        locked.agents,
        Arr.filter((agent) => !targetAgents.includes(agent)),
      );

      // If no agents remain, remove skill entirely
      if (remainingAgents.length === 0) {
        return Option.none();
      }

      // Keep skill with reduced agents
      return Option.some({
        name: skill.name,
        source: locked.source,
        version: locked.version,
        gitTreeHash: locked.gitTreeHash,
        agents: remainingAgents,
      } satisfies IdealSkillV2);
    }),
  );

  return { skills };
};

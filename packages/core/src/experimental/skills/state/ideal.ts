/**
 * Ideal state builders for skills - constructs desired state for operations.
 *
 * Each operation (install, update, uninstall, sync) has its own builder that
 * constructs the ideal state from the current state and operation parameters.
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
  type IdealSkill,
  type IdealSkillsState,
  SkillSource,
  type SkillState,
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
    source.parsed.type === "local"
      ? SkillSource.Local({ path: nodePath.dirname(skill.path) })
      : source.parsed.type === "github" || source.parsed.type === "gitlab"
        ? SkillSource.Git({
            url: source.parsed.canonical,
            ref: Option.fromNullable(source.parsed.ref),
            subpath: Option.fromNullable(source.parsed.path),
          })
        : source.parsed.type === "well-known"
          ? SkillSource.WellKnown({
              baseUrl: source.parsed.url ?? source.parsed.canonical,
              skillName: skill.name,
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

/**
 * Ideal state builders for skills reconciliation.
 *
 * Computes the desired state for skills operations based on current state
 * and command parameters. Part of the desired-state reconciliation pattern.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import type { Source } from "../sources/types.js";
import type {
  CurrentState,
  IdealSkillV2,
  IdealState,
  SkillStateV2,
} from "../extensions/skills/state/types.js";
import type { Skill, SkillRef } from "../cli-commands/skills/install/discover-skills.js";

// =============================================================================
// Errors
// =============================================================================

/**
 * Error during command execution (building ideal state).
 *
 * @experimental This API is unstable and may change without notice.
 */
export class CommandError extends Data.TaggedError("CommandError")<{
  readonly message: string;
  readonly cause: Option.Option<unknown>;
}> {}

// =============================================================================
// WorkspaceOperation Types
// =============================================================================

/**
 * Discovered skill from a source.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface DiscoveredSkill {
  readonly name: string;
  readonly version: Option.Option<string>;
  readonly gitTreeHash: Option.Option<string>;
}

/**
 * Add a skill to the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type AddSkillOperation = {
  readonly _tag: "add-skill";
  readonly source: Source;
  readonly agents: ReadonlyArray<string>;
  readonly force: boolean;
} & SkillRef;

/**
 * Remove a skill from the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface RemoveSkillOperation {
  readonly _tag: "remove-skill";
  readonly name: string;
}

/**
 * A workspace operation that transforms the ideal state.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type WorkspaceOperation = AddSkillOperation | RemoveSkillOperation;

// =============================================================================
// buildIdealState (operation-based)
// =============================================================================

/**
 * Build ideal state by folding operations over current state.
 *
 * Starts from the current state's locked skills, then applies each operation:
 * - `add-skill`: Add or replace a skill (with conflict check unless force)
 * - `remove-skill`: Remove a skill (with existence check)
 *
 * @param current - Current workspace state
 * @param ops - Operations to apply
 * @returns Effect yielding ideal state or CommandError
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildIdealFromOperations = (
  current: CurrentState,
  ops: ReadonlyArray<WorkspaceOperation>,
): Effect.Effect<IdealState, CommandError> =>
  Effect.gen(function* () {
    // Start from current locked skills
    let skills: IdealSkillV2[] = pipe(current.skills, Array.filterMap(currentToIdeal));

    for (const op of ops) {
      switch (op._tag) {
        case "add-skill": {
          // Check for conflict
          const existingIndex = skills.findIndex((s) => s.name === op.skill.name);
          if (existingIndex >= 0 && !op.force) {
            const existing = skills[existingIndex]!;
            if (!sourcesEqual(existing.source, op.source)) {
              return yield* Effect.fail(
                new CommandError({
                  message: `Skills already installed from different source: ${op.skill.name}`,
                  cause: Option.none(),
                }),
              );
            }
          }

          const newSkill: IdealSkillV2 = {
            name: op.skill.name,
            source: op.source,
            version: op.skill.version,
            gitTreeHash: op.skill.gitTreeHash,
            agents: op.agents,
          };

          if (existingIndex >= 0) {
            // Replace existing
            skills = [
              ...skills.slice(0, existingIndex),
              newSkill,
              ...skills.slice(existingIndex + 1),
            ];
          } else {
            skills = [...skills, newSkill];
          }
          break;
        }
        case "remove-skill": {
          const exists =
            skills.some((s) => s.name === op.name) ||
            pipe(
              current.skills,
              Array.some((s) => s.name === op.name),
            );
          if (!exists) {
            return yield* Effect.fail(
              new CommandError({
                message: `Skills not found: ${op.name}`,
                cause: Option.none(),
              }),
            );
          }
          skills = skills.filter((s) => s.name !== op.name);
          break;
        }
      }
    }

    return { skills };
  });

// =============================================================================
// Command Types (legacy - used by handlers until migrated)
// =============================================================================

/**
 * Install command.
 *
 * @deprecated Use AddSkillOperation with buildIdealFromOperations instead.
 * @experimental This API is unstable and may change without notice.
 */
export interface InstallCommand {
  readonly _tag: "skills-install";
  /** GitHub shorthand (owner/repo), local path, or URL */
  readonly source: string;
  /** Target agents (already resolved by handler) */
  readonly agents: ReadonlyArray<string>;
  /** Skill names to install (resolved before command construction) */
  readonly skills: Array.NonEmptyReadonlyArray<string>;
  /** Skip confirmation when replacing skill from different source */
  readonly force: boolean;
}

/**
 * Uninstall command.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface UninstallCommand {
  readonly _tag: "skills-uninstall";
  /** Skill names to uninstall */
  readonly skills: ReadonlyArray<string>;
}

/**
 * Update command.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface UpdateCommand {
  readonly _tag: "skills-update";
  /** "all" to update all installed skills, or specific skill names */
  readonly skills: "all" | ReadonlyArray<string>;
}

/**
 * Command discriminated union for skills operations.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Command = InstallCommand | UninstallCommand | UpdateCommand;

// =============================================================================
// Helper Types (legacy)
// =============================================================================

/**
 * Dependencies for buildIdealForInstall.
 * Allows injection for testing.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface BuildIdealDeps {
  /** Parse source string into Source */
  readonly parseSource: (source: string) => Effect.Effect<Source, CommandError>;
  /** Discover skills from a source */
  readonly discoverSkills: (
    source: Source,
  ) => Effect.Effect<ReadonlyArray<DiscoveredSkill>, CommandError>;
}

// =============================================================================
// Pure Helper Functions
// =============================================================================

/**
 * Compare two optional strings for equality.
 */
const optionStringEquals = (a: Option.Option<string>, b: Option.Option<string>): boolean =>
  Option.match(a, {
    onNone: () => Option.isNone(b),
    onSome: (va) =>
      Option.match(b, {
        onNone: () => false,
        onSome: (vb) => va === vb,
      }),
  });

/**
 * Compare two sources for equality.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const sourcesEqual = (a: Source, b: Source): boolean => {
  if (a.source !== b.source) return false;

  switch (a.source) {
    case "github":
    case "gitlab":
    case "bitbucket": {
      const bHosting = b as typeof a;
      return (
        a.owner === bHosting.owner &&
        a.repo === bHosting.repo &&
        optionStringEquals(a.ref, bHosting.ref) &&
        optionStringEquals(a.subPath, bHosting.subPath)
      );
    }
    case "azurerepos": {
      const bAzure = b as typeof a;
      return (
        a.organization === bAzure.organization &&
        a.project === bAzure.project &&
        a.repo === bAzure.repo &&
        optionStringEquals(a.ref, bAzure.ref) &&
        optionStringEquals(a.subPath, bAzure.subPath)
      );
    }
    case "git": {
      const bGit = b as typeof a;
      const aUrl = "url" in a ? a.url : a.path;
      const bUrl = "url" in bGit ? bGit.url : bGit.path;
      return aUrl === bUrl && optionStringEquals(a.ref, bGit.ref);
    }
    case "registry": {
      const bReg = b as typeof a;
      const aPath = "url" in a ? a.url : a.path;
      const bPath = "url" in bReg ? bReg.url : bReg.path;
      return aPath === bPath;
    }
    case "local": {
      const bLocal = b as typeof a;
      return a.path === bLocal.path;
    }
  }
};

/**
 * Convert current skill state to ideal representation.
 * Returns None if the skill has no locked state.
 *
 * @experimental This API is unstable and may change without notice.
 */
const currentToIdeal = (skill: SkillStateV2): Option.Option<IdealSkillV2> =>
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
 * Check if skill name already exists in current state.
 *
 * @experimental This API is unstable and may change without notice.
 */
const nameExists = (current: CurrentState, name: string): boolean =>
  pipe(
    current.skills,
    Array.some((s) => s.name === name),
  );

// =============================================================================
// buildIdealForInstall
// =============================================================================

/**
 * Build ideal state for install command.
 *
 * Algorithm:
 * 1. Parse and validate source
 * 2. Discover available skills from source
 * 3. Filter by skills parameter
 * 4. Check for name conflicts (unique across all sources)
 * 5. Build ideal state with merged skills
 *
 * @param current - Current workspace state
 * @param cmd - Install command with source, agents, skills, force
 * @param deps - Dependencies (parseSource, discoverSkills)
 * @returns Effect yielding ideal state or CommandError
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildIdealForInstall = (
  current: CurrentState,
  cmd: Command & { _tag: "skills-install" },
  deps: BuildIdealDeps,
): Effect.Effect<IdealState, CommandError> =>
  Effect.gen(function* () {
    // Step 1: Parse and validate source
    const source = yield* deps.parseSource(cmd.source);

    // Step 2: Discover available skills from source
    const discovered = yield* deps.discoverSkills(source);

    // Step 3: Filter by skills parameter
    const toInstall = pipe(
      discovered,
      Array.filter((s) => cmd.skills.includes(s.name)),
    );

    // Step 4: Check for name conflicts (unique across all sources)
    const conflicts = pipe(
      toInstall,
      Array.filter((s) => nameExists(current, s.name)),
      Array.filter((s) => {
        // Allow reinstall from same source, reject different source
        const existing = pipe(
          current.skills,
          Array.findFirst((cs) => cs.name === s.name),
          Option.flatMap((cs) => cs.locked),
        );
        return pipe(
          existing,
          Option.match({
            onNone: () => false,
            onSome: (locked) => !sourcesEqual(locked.source, source),
          }),
        );
      }),
    );

    if (Array.isNonEmptyArray(conflicts) && !cmd.force) {
      return yield* Effect.fail(
        new CommandError({
          message: `Skills already installed from different source: ${conflicts.map((s) => s.name).join(", ")}`,
          cause: Option.none(),
        }),
      );
    }

    // Step 5: Build ideal state
    // Keep existing skills not being replaced
    const existing = pipe(
      current.skills,
      Array.filterMap((s) => {
        const beingReplaced = pipe(
          toInstall,
          Array.some((i) => i.name === s.name),
        );
        return beingReplaced ? Option.none() : currentToIdeal(s);
      }),
    );

    // Add new/replacement skills
    const newSkills = pipe(
      toInstall,
      Array.map(
        (s): IdealSkillV2 => ({
          name: s.name,
          source,
          version: s.version,
          gitTreeHash: s.gitTreeHash,
          agents: cmd.agents,
        }),
      ),
    );

    return { skills: Array.appendAll(existing, newSkills) };
  });

// =============================================================================
// buildIdealForUninstall
// =============================================================================

/**
 * Build ideal state for uninstall command.
 *
 * Algorithm:
 * 1. Validate all requested skills exist in current state
 * 2. Error if any skill not found
 * 3. Filter out skills being uninstalled
 * 4. Return ideal state with remaining skills
 *
 * Note: Only skills with locked state (in lockfile) can contribute to ideal state.
 * Orphaned skills (actual only, no locked) are excluded.
 *
 * @param current - Current workspace state
 * @param cmd - Uninstall command with skill names
 * @returns Effect yielding ideal state or CommandError
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildIdealForUninstall = (
  current: CurrentState,
  cmd: Command & { _tag: "skills-uninstall" },
): Effect.Effect<IdealState, CommandError> =>
  Effect.gen(function* () {
    // Validate all skills exist
    const notFound = pipe(
      cmd.skills,
      Array.filter((name) => !nameExists(current, name)),
    );

    if (Array.isNonEmptyArray(notFound)) {
      return yield* Effect.fail(
        new CommandError({
          message: `Skills not found: ${notFound.join(", ")}`,
          cause: Option.none(),
        }),
      );
    }

    // Keep skills not being uninstalled
    const remaining = pipe(
      current.skills,
      Array.filter((s) => !cmd.skills.includes(s.name)),
      Array.filterMap(currentToIdeal),
    );

    return { skills: remaining };
  });

// =============================================================================
// buildIdealForUpdate (placeholder)
// =============================================================================

/**
 * Dependencies for buildIdealForUpdate.
 * Allows injection for testing.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface BuildIdealUpdateDeps {
  /** Fetch latest version/hash for a source */
  readonly fetchLatestVersion: (
    source: Source,
  ) => Effect.Effect<
    { version: Option.Option<string>; gitTreeHash: Option.Option<string> },
    CommandError
  >;
}

/**
 * Build ideal state for update command.
 *
 * @param current - Current workspace state
 * @param cmd - Update command with skill names
 * @param deps - Dependencies (fetchLatestVersion)
 * @returns Effect yielding ideal state or CommandError
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildIdealForUpdate = (
  current: CurrentState,
  cmd: Command & { _tag: "skills-update" },
  deps: BuildIdealUpdateDeps,
): Effect.Effect<IdealState, CommandError> =>
  Effect.gen(function* () {
    // Determine which skills to update
    const toUpdate =
      cmd.skills === "all"
        ? pipe(
            current.skills,
            Array.filter((s) => Option.isSome(s.locked)),
          )
        : pipe(
            current.skills,
            Array.filter((s) => cmd.skills.includes(s.name) && Option.isSome(s.locked)),
          );

    // Validate requested skills exist
    if (cmd.skills !== "all") {
      const notFound = pipe(
        cmd.skills,
        Array.filter((name) => !nameExists(current, name)),
      );
      if (Array.isNonEmptyArray(notFound)) {
        return yield* Effect.fail(
          new CommandError({
            message: `Skills not found: ${notFound.join(", ")}`,
            cause: Option.none(),
          }),
        );
      }
    }

    // Fetch latest versions for skills being updated
    const updated = yield* pipe(
      toUpdate,
      Effect.forEach(
        (skill) =>
          Effect.gen(function* () {
            const locked = Option.getOrThrow(skill.locked); // Safe: filtered above
            const latest = yield* deps.fetchLatestVersion(locked.source);
            return {
              name: skill.name,
              source: locked.source,
              version: latest.version,
              gitTreeHash: latest.gitTreeHash,
              agents: locked.agents,
            } satisfies IdealSkillV2;
          }),
        { concurrency: "unbounded" },
      ),
    );

    // Keep skills not being updated
    const unchanged = pipe(
      current.skills,
      Array.filter(
        (s) =>
          !pipe(
            toUpdate,
            Array.some((u) => u.name === s.name),
          ),
      ),
      Array.filterMap(currentToIdeal),
    );

    return { skills: Array.appendAll(unchanged, updated) };
  });

// =============================================================================
// buildIdealState (command dispatch)
// =============================================================================

/**
 * Dependencies for buildIdealState that combines all operation dependencies.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface BuildIdealStateDeps extends BuildIdealDeps, BuildIdealUpdateDeps {}

/**
 * Compute ideal state for a command based on current state.
 * Dispatches to the appropriate builder function.
 *
 * @param current - Current workspace state
 * @param cmd - Command to execute
 * @param deps - Dependencies (parseSource, discoverSkills, fetchLatestVersion)
 * @returns Effect yielding ideal state or CommandError
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildIdealState = (
  current: CurrentState,
  cmd: Command,
  deps: BuildIdealStateDeps,
): Effect.Effect<IdealState, CommandError> =>
  Effect.gen(function* () {
    switch (cmd._tag) {
      case "skills-install":
        return yield* buildIdealForInstall(current, cmd, deps);
      case "skills-uninstall":
        return yield* buildIdealForUninstall(current, cmd);
      case "skills-update":
        return yield* buildIdealForUpdate(current, cmd, deps);
    }
  });

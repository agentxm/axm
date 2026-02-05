/**
 * Ideal state builders for skills reconciliation.
 *
 * Computes the desired state for skills operations based on current state
 * and command parameters. Part of the desired-state reconciliation pattern.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Arr from "effect/Array";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import type {
  CurrentState,
  IdealSkillV2,
  IdealState,
  SkillSourceV2,
  SkillStateV2,
} from "../extensions/skills/state/types.js";

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
// Command Types
// =============================================================================

/**
 * Command discriminated union for skills operations.
 *
 * @experimental This API is unstable and may change without notice.
 */
/**
 * Install command.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface InstallCommand {
  readonly _tag: "skills-install";
  /** GitHub shorthand (owner/repo), local path, or URL */
  readonly source: string;
  /** Target agents (already resolved by handler) */
  readonly agents: ReadonlyArray<string>;
  /** "all" to install all discovered skills, or specific skill names */
  readonly skills: "all" | ReadonlyArray<string>;
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
// Helper Types
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
 * Dependencies for buildIdealForInstall.
 * Allows injection for testing.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface BuildIdealDeps {
  /** Parse source string into SkillSource */
  readonly parseSource: (source: string) => Effect.Effect<SkillSourceV2, CommandError>;
  /** Discover skills from a source */
  readonly discoverSkills: (
    source: SkillSourceV2,
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
export const sourcesEqual = (a: SkillSourceV2, b: SkillSourceV2): boolean => {
  if (a._tag !== b._tag) return false;

  switch (a._tag) {
    case "Registry": {
      const bReg = b as typeof a;
      return (
        a.scope === bReg.scope &&
        a.name === bReg.name &&
        optionStringEquals(a.version, bReg.version)
      );
    }
    case "GitHub": {
      const bGH = b as typeof a;
      return (
        a.owner === bGH.owner &&
        a.repo === bGH.repo &&
        optionStringEquals(a.ref, bGH.ref) &&
        optionStringEquals(a.path, bGH.path)
      );
    }
    case "Local": {
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
    Arr.some((s) => s.name === name),
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
    const toInstall =
      cmd.skills === "all"
        ? discovered
        : pipe(
            discovered,
            Arr.filter((s) => cmd.skills.includes(s.name)),
          );

    // Step 4: Check for name conflicts (unique across all sources)
    const conflicts = pipe(
      toInstall,
      Arr.filter((s) => nameExists(current, s.name)),
      Arr.filter((s) => {
        // Allow reinstall from same source, reject different source
        const existing = pipe(
          current.skills,
          Arr.findFirst((cs) => cs.name === s.name),
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

    if (Arr.isNonEmptyArray(conflicts) && !cmd.force) {
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
      Arr.filterMap((s) => {
        const beingReplaced = pipe(
          toInstall,
          Arr.some((i) => i.name === s.name),
        );
        return beingReplaced ? Option.none() : currentToIdeal(s);
      }),
    );

    // Add new/replacement skills
    const newSkills = pipe(
      toInstall,
      Arr.map(
        (s): IdealSkillV2 => ({
          name: s.name,
          source,
          version: s.version,
          gitTreeHash: s.gitTreeHash,
          agents: cmd.agents,
        }),
      ),
    );

    return { skills: Arr.appendAll(existing, newSkills) };
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
      Arr.filter((name) => !nameExists(current, name)),
    );

    if (Arr.isNonEmptyArray(notFound)) {
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
      Arr.filter((s) => !cmd.skills.includes(s.name)),
      Arr.filterMap(currentToIdeal),
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
    source: SkillSourceV2,
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
            Arr.filter((s) => Option.isSome(s.locked)),
          )
        : pipe(
            current.skills,
            Arr.filter((s) => cmd.skills.includes(s.name) && Option.isSome(s.locked)),
          );

    // Validate requested skills exist
    if (cmd.skills !== "all") {
      const notFound = pipe(
        cmd.skills,
        Arr.filter((name) => !nameExists(current, name)),
      );
      if (Arr.isNonEmptyArray(notFound)) {
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
      Arr.filterMap(currentToIdeal),
    );

    return { skills: Arr.appendAll(unchanged, updated) };
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

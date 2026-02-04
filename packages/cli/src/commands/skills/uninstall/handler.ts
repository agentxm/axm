/**
 * Uninstall command handler - Effect-based orchestration for `axm skills uninstall`.
 *
 * Uses desired-state reconciliation pattern:
 * 1. Create workspace context (local vs global)
 * 2. Ensure workspace is initialized
 * 3. Load current state (actual from disk + locked from lockfile)
 * 4. Build ideal state with skill removed
 * 5. Build plan (diff current vs ideal)
 * 6. Display plan (dry-run stops here)
 * 7. Apply plan (if not dry-run)
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as nodePath from "node:path";
import { type AgentConfig, getAgentById } from "@agentxm/core/experimental/agents";
import { getAxmDir } from "@agentxm/core/experimental/paths";
import { ensureInitialized } from "@agentxm/core/experimental/skills";
import {
  applyDiff,
  buildIdealForUninstall,
  computeDiff,
  hasChanges,
  loadSkillsState,
  type SkillsDiff,
  type SkillsState,
} from "@agentxm/core/experimental/skills/state";
import * as p from "@clack/prompts";
import { FileSystem, type Path } from "@effect/platform";
import { Data, Effect, Option } from "effect";
import { formatError } from "../../../utils/errors.js";
import { promptConfirm } from "../../../utils/prompts.js";
import { createSpinnerHelper } from "../../../utils/spinner.js";
import { isInteractive } from "../../../utils/tty.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the uninstall command.
 */
export interface UninstallArgs {
  /** Name of the skill to uninstall */
  readonly skill: string;
  /** Target agent(s) to uninstall from (empty = all agents) */
  readonly agent: readonly string[];
  /** Skip confirmations */
  readonly yes: boolean;
  /** Preview uninstall plan without making changes */
  readonly dryRun: boolean;
  /** Output as JSON */
  readonly json: boolean;
}

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

/**
 * Error that occurs during skill uninstallation.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class UninstallError extends Data.TaggedError("UninstallError")<{
  readonly message: string;
  readonly cause?: unknown;
  readonly retryable: boolean;
}> {}

// -----------------------------------------------------------------------------
// Plan Display
// -----------------------------------------------------------------------------

/**
 * Display the uninstall plan in human-readable format using diff structure.
 */
const displayPlanFromDiff = (diff: SkillsDiff): void => {
  p.log.info("Plan:");
  p.log.message("");
  p.log.message("  Skills:");

  for (const [name, change] of Object.entries(diff.changes)) {
    if (change._tag === "Remove") {
      // Get agent names from locked state if available
      const agents = Option.match(change.skill.locked, {
        onNone: () => [] as readonly string[],
        onSome: (locked) => locked.agents,
      });
      const agentInfo = agents.length > 0 ? ` @ ${agents.join(", ")}` : "";
      p.log.message(`  - ${name}${agentInfo} (uninstall)`);
    }
  }

  p.log.message("");
  p.log.message(`  Summary: ${diff.summary.remove} skill(s) to uninstall`);
};

/**
 * Display the uninstall plan in human-readable format (for partial uninstall).
 */
const displayPlan = (skillName: string, agents: readonly string[]): void => {
  p.log.info("Plan:");
  p.log.message("");
  p.log.message("  Skills:");
  p.log.message(`  - ${skillName} @ ${agents.join(", ")} (uninstall)`);
  p.log.message("");
  p.log.message("  Summary: 1 skill to uninstall");
};

/**
 * Output plan as JSON.
 */
const outputPlanJson = (skillName: string, agents: readonly string[]): void => {
  const json = {
    changes: [
      {
        name: skillName,
        _tag: "Remove",
        agents,
      },
    ],
    summary: {
      add: 0,
      update: 0,
      remove: 1,
      unchanged: 0,
      repair: 0,
    },
  };
  console.log(JSON.stringify(json, null, 2));
};

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm skills uninstall` command.
 *
 * Flow (state-based architecture):
 * 1. Ensure .axm/ is initialized
 * 2. Load current state (actual + locked)
 * 3. Validate skill exists
 * 4. Build ideal state with skill removed
 * 5. Compute diff (the plan)
 * 6. Display plan (dry-run stops here)
 * 7. Confirm and apply changes
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleUninstall = (
  args: UninstallArgs,
): Effect.Effect<void, UninstallError, FileSystem.FileSystem | Path.Path> => {
  const axmDir = getAxmDir(false); // Always local for uninstall

  return Effect.gen(function* () {
    // JSON mode should suppress non-JSON output
    const showOutput = !args.json;

    // Show intro
    if (showOutput) {
      p.intro("axm skills uninstall");
    }

    // Create spinner helper (auto-detects TTY)
    const spinnerHelper = createSpinnerHelper();

    // Step 1: Ensure initialized
    if (showOutput) spinnerHelper.start("Checking initialization...");
    yield* ensureInitialized({ axmDir }).pipe(
      Effect.mapError(
        (error) =>
          new UninstallError({
            message: `Workspace not initialized: ${error.message}`,
            cause: error,
            retryable: false,
          }),
      ),
    );
    if (showOutput) spinnerHelper.stop("Initialized");

    // Step 2: Load current state using state-based pattern
    if (showOutput) spinnerHelper.start("Loading current state...");
    const currentState = yield* loadSkillsState(axmDir).pipe(
      Effect.mapError(
        (error) =>
          new UninstallError({
            message: `Failed to load state: ${error.message}`,
            cause: error,
            retryable: false,
          }),
      ),
    );
    if (showOutput) spinnerHelper.stop("Loaded current state");

    // Step 3: Validate skill exists in current state
    const skillState = currentState.skills[args.skill];
    if (!skillState || Option.isNone(skillState.locked)) {
      return yield* new UninstallError({
        message: formatError(
          `Skill '${args.skill}' is not installed`,
          [],
          "Use 'axm skills list' to see installed skills.",
        ),
        retryable: false,
      });
    }

    // Get the current agents from the locked state
    // The locked state doesn't track agents directly - check lockfile for that
    // We need to determine if this is a partial or full uninstall
    const isPartialUninstall = args.agent.length > 0;

    // For partial uninstall, we need to handle it differently since the
    // legacy state-based pattern doesn't support partial agent removal.
    // Only use the full state-based pattern for complete uninstalls.
    if (isPartialUninstall) {
      yield* handlePartialUninstall(args, axmDir, showOutput, spinnerHelper);
    } else {
      yield* handleFullUninstall(args, currentState, axmDir, showOutput, spinnerHelper);
    }
  });
};

/**
 * Handle full uninstall using the state-based reconciliation pattern.
 */
const handleFullUninstall = (
  args: UninstallArgs,
  currentState: SkillsState,
  axmDir: string,
  showOutput: boolean,
  spinnerHelper: ReturnType<typeof createSpinnerHelper>,
): Effect.Effect<void, UninstallError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    // Step 4: Build ideal state with skill removed
    if (showOutput) spinnerHelper.start("Building uninstall plan...");
    const idealState = yield* buildIdealForUninstall(currentState, [args.skill]).pipe(
      Effect.mapError(
        (error) =>
          new UninstallError({
            message: `Failed to build ideal state: ${error.message}`,
            cause: error,
            retryable: false,
          }),
      ),
    );
    if (showOutput) spinnerHelper.stop("Built uninstall plan");

    // Step 5: Compute diff
    const diff = computeDiff(currentState, idealState);

    // Check if there are changes
    if (!hasChanges(diff)) {
      if (showOutput) {
        p.log.info("No changes needed.");
        p.outro("Nothing to do.");
      }
      return;
    }

    // Step 6: Display plan
    if (args.json) {
      // For JSON output, use the simple format with empty agents (full uninstall)
      outputPlanJson(args.skill, []);
      if (args.dryRun) {
        return;
      }
    } else {
      displayPlanFromDiff(diff);
    }

    // Dry-run stops here
    if (args.dryRun) {
      if (showOutput) {
        p.outro("Dry-run complete. No changes made.");
      }
      return;
    }

    // Step 7: Confirm uninstallation (unless --yes)
    if (!args.yes) {
      if (!isInteractive()) {
        return yield* new UninstallError({
          message: formatError(
            "Cannot prompt for confirmation",
            ["stdin is not a TTY"],
            "Use --yes to run without prompts.",
          ),
          retryable: false,
        });
      }
      const confirmed = yield* promptConfirm("Apply changes?").pipe(
        Effect.mapError(
          (error) =>
            new UninstallError({
              message: "Failed to prompt for confirmation",
              cause: error,
              retryable: false,
            }),
        ),
      );
      if (!confirmed) {
        p.cancel("Uninstallation cancelled.");
        return;
      }
    }

    // Step 8: Apply changes using applyDiff
    if (showOutput) {
      spinnerHelper.start(`Uninstalling ${args.skill}...`);
    }

    // Get agent configs for the apply operation
    // The applyRemove function uses the agents from ApplyOptions to remove symlinks
    // For full uninstall, applyDiff handles settings/lockfile cleanup
    const agentConfigs: AgentConfig[] = [];

    const applyResult = yield* applyDiff(diff, { axmDir, agents: agentConfigs }).pipe(
      Effect.mapError(
        (error) =>
          new UninstallError({
            message: `Failed to apply changes: ${error.message}`,
            cause: error,
            retryable: false,
          }),
      ),
    );

    if (showOutput) spinnerHelper.stop(`Uninstalled ${args.skill}`);

    // Show completion
    if (showOutput) {
      if (applyResult.failed.length > 0) {
        for (const failure of applyResult.failed) {
          p.log.error(`${failure.skillName}: ${failure.error.message}`);
        }
      }
      p.log.success(`Successfully uninstalled ${args.skill}`);
      p.outro("Done.");
    }
  });

/**
 * Handle partial uninstall (--agent flag) - removes skill from specific agents only.
 *
 * Note: The legacy state-based pattern doesn't support partial agent removal,
 * so we handle this case manually for now.
 */
const handlePartialUninstall = (
  args: UninstallArgs,
  axmDir: string,
  showOutput: boolean,
  spinnerHelper: ReturnType<typeof createSpinnerHelper>,
): Effect.Effect<void, UninstallError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    // Import the lockfile functions for partial uninstall
    const { readLockfile, updateLockEntry } = yield* Effect.promise(
      async () => import("@agentxm/core/experimental/skills"),
    );

    // Read lockfile to get current agents
    const lockfile = yield* readLockfile(axmDir).pipe(
      Effect.mapError(
        (error) =>
          new UninstallError({
            message: `Failed to read lockfile: ${error.message}`,
            cause: error,
            retryable: false,
          }),
      ),
    );

    const lockEntry = lockfile.skills[args.skill];
    if (!lockEntry) {
      return yield* new UninstallError({
        message: formatError(
          `Skill '${args.skill}' is not installed`,
          [],
          "Use 'axm skills list' to see installed skills.",
        ),
        retryable: false,
      });
    }

    const currentAgents = lockEntry.agents;
    const targetAgents = args.agent;
    const remainingAgents = currentAgents.filter((a) => !targetAgents.includes(a));

    // Check if this will become a full removal
    const isFullRemoval = remainingAgents.length === 0;

    // Build plan
    if (showOutput) spinnerHelper.start("Building uninstall plan...");
    if (showOutput) spinnerHelper.stop("Built uninstall plan");

    // Display plan
    if (args.json) {
      outputPlanJson(args.skill, targetAgents);
      if (args.dryRun) {
        return;
      }
    } else {
      displayPlan(args.skill, targetAgents);
    }

    // Dry-run stops here
    if (args.dryRun) {
      if (showOutput) {
        p.outro("Dry-run complete. No changes made.");
      }
      return;
    }

    // Confirm uninstallation (unless --yes)
    if (!args.yes) {
      if (!isInteractive()) {
        return yield* new UninstallError({
          message: formatError(
            "Cannot prompt for confirmation",
            ["stdin is not a TTY"],
            "Use --yes to run without prompts.",
          ),
          retryable: false,
        });
      }
      const confirmed = yield* promptConfirm("Apply changes?").pipe(
        Effect.mapError(
          (error) =>
            new UninstallError({
              message: "Failed to prompt for confirmation",
              cause: error,
              retryable: false,
            }),
        ),
      );
      if (!confirmed) {
        p.cancel("Uninstallation cancelled.");
        return;
      }
    }

    // Apply changes
    if (showOutput) {
      spinnerHelper.start(`Uninstalling ${args.skill}...`);
    }

    // Get agent configs for removal
    const agentConfigs: AgentConfig[] = targetAgents
      .map((id) => getAgentById(id))
      .filter(Option.isSome)
      .map((opt) => opt.value);

    if (isFullRemoval) {
      // This became a full removal - use state-based pattern
      // Re-load state and use applyDiff
      const currentState = yield* loadSkillsState(axmDir).pipe(
        Effect.mapError(
          (error) =>
            new UninstallError({
              message: `Failed to load state: ${error.message}`,
              cause: error,
              retryable: false,
            }),
        ),
      );

      const idealState = yield* buildIdealForUninstall(currentState, [args.skill]).pipe(
        Effect.mapError(
          (error) =>
            new UninstallError({
              message: `Failed to build ideal state: ${error.message}`,
              cause: error,
              retryable: false,
            }),
        ),
      );

      const diff = computeDiff(currentState, idealState);

      yield* applyDiff(diff, { axmDir, agents: agentConfigs }).pipe(
        Effect.mapError(
          (error) =>
            new UninstallError({
              message: `Failed to apply changes: ${error.message}`,
              cause: error,
              retryable: false,
            }),
        ),
      );
    } else {
      // Partial removal - remove symlinks from target agents but keep canonical
      yield* Effect.all(
        agentConfigs.map((agent) =>
          Effect.gen(function* () {
            const agentSkillsDir = agent.skills.projectDir;
            const skillPath = nodePath.join(agentSkillsDir, args.skill);

            const exists = yield* fs.exists(skillPath);
            if (exists) {
              yield* fs.remove(skillPath, { recursive: true });
            }
          }),
        ),
        { concurrency: "unbounded" },
      ).pipe(
        Effect.mapError(
          (error) =>
            new UninstallError({
              message: `Failed to remove skill from agents: ${String(error)}`,
              cause: error,
              retryable: false,
            }),
        ),
      );

      // Update lockfile with remaining agents
      yield* updateLockEntry(axmDir, args.skill, {
        ...lockEntry,
        agents: remainingAgents,
      }).pipe(
        Effect.mapError(
          (error) =>
            new UninstallError({
              message: `Failed to update lockfile: ${error.message}`,
              cause: error,
              retryable: false,
            }),
        ),
      );
    }

    if (showOutput) spinnerHelper.stop(`Uninstalled ${args.skill}`);

    // Show completion
    if (showOutput) {
      if (isFullRemoval) {
        p.log.success(`Successfully uninstalled ${args.skill}`);
      } else {
        p.log.success(`Successfully removed ${args.skill} from ${targetAgents.join(", ")}`);
        p.log.info(`Skill remains installed for: ${remainingAgents.join(", ")}`);
      }
      p.outro("Done.");
    }
  });

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
import { getAxmDir } from "@agentxm/core/experimental/paths";
import {
  type AgentConfig,
  ensureInitialized,
  getAgentById,
  readLockfile,
  removeLockEntry,
  removeSkillFromAgents,
  type SkillLockEntry,
  updateLockEntry,
  updateSettings,
} from "@agentxm/core/experimental/skills";
import * as p from "@clack/prompts";
import { FileSystem, type Path } from "@effect/platform";
import { Data, Effect } from "effect";
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
 * Display the uninstall plan in human-readable format.
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

    // Step 2: Load lockfile to check installed skills
    if (showOutput) spinnerHelper.start("Loading current state...");
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
    if (showOutput) spinnerHelper.stop("Loaded current state");

    // Step 3: Validate skill exists in lockfile
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

    // Get the current agents from the lockfile
    const currentAgents = lockEntry.agents;

    // Determine target agents for removal
    const targetAgents: readonly string[] = args.agent.length > 0 ? args.agent : currentAgents;

    // Compute remaining agents after uninstall
    const remainingAgents =
      args.agent.length > 0 ? currentAgents.filter((a) => !args.agent.includes(a)) : [];

    // Step 4: Build uninstall plan
    if (showOutput) spinnerHelper.start("Building uninstall plan...");
    const isFullRemoval = remainingAgents.length === 0;
    if (showOutput) spinnerHelper.stop("Built uninstall plan");

    // Step 5: Display plan
    const displayAgents = isFullRemoval ? currentAgents : targetAgents;
    if (args.json) {
      outputPlanJson(args.skill, displayAgents);
      if (args.dryRun) {
        return;
      }
    } else {
      displayPlan(args.skill, displayAgents);
    }

    // Step 6: Dry-run stops here
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

    // Step 8: Apply changes
    if (showOutput) {
      spinnerHelper.start(`Uninstalling ${args.skill}...`);
    }

    // Get agent configs for removal
    const agentConfigs: AgentConfig[] = targetAgents
      .map((id) => getAgentById(id))
      .filter((a): a is AgentConfig => a !== undefined);

    if (isFullRemoval) {
      // Full removal - remove from all agents and delete canonical
      yield* removeSkillFromAgents(args.skill, agentConfigs, axmDir).pipe(
        Effect.mapError(
          (error) =>
            new UninstallError({
              message: `Failed to remove skill files: ${error.message}`,
              cause: error,
              retryable: false,
            }),
        ),
      );

      // Remove from settings (null = remove skill, per JSON merge-patch semantics)
      const skillsUpdate = { [args.skill]: null } as Record<string, string | null>;
      yield* updateSettings(axmDir, { skills: skillsUpdate }).pipe(
        Effect.mapError(
          (error) =>
            new UninstallError({
              message: `Failed to update settings: ${error.message}`,
              cause: error,
              retryable: false,
            }),
        ),
      );

      // Remove from lockfile
      yield* removeLockEntry(axmDir, args.skill).pipe(
        Effect.mapError(
          (error) =>
            new UninstallError({
              message: `Failed to update lockfile: ${error.message}`,
              cause: error,
              retryable: false,
            }),
        ),
      );
    } else {
      // Partial removal - remove symlinks from target agents but keep canonical
      const fs = yield* FileSystem.FileSystem;

      // Remove symlinks from target agents
      yield* Effect.all(
        agentConfigs.map((agent) =>
          Effect.gen(function* () {
            const agentSkillsDir = agent.skillsDir ?? nodePath.join(agent.detectPath, "skills");
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
      const updatedEntry: SkillLockEntry = {
        ...lockEntry,
        agents: remainingAgents,
      };

      yield* updateLockEntry(axmDir, args.skill, updatedEntry).pipe(
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
};

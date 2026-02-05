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
import { readLockfile, updateLockEntry } from "@agentxm/core/experimental/skills";
import {
  type ApplyDeps,
  applyPlan,
  applyStep,
  buildIdealForUninstall,
  buildPlan,
  ensureInit,
  getPlanSummary,
  loadCurrentState,
  makeWorkspaceContext,
  type Plan,
  type PlanStep,
  planHasChanges,
  type UninstallCommand,
  updateLockfileForPlan,
  updateSettingsForPlan,
  type WorkspaceContext,
} from "@agentxm/core/experimental/workspace";
import * as p from "@clack/prompts";
import * as FileSystem from "@effect/platform/FileSystem";
import type { Path } from "@effect/platform";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
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
 * Display the uninstall plan in human-readable format using V2 plan structure.
 */
const displayPlanFromPlan = (plan: Plan): void => {
  p.log.info("Plan:");
  p.log.message("");
  p.log.message("  Skills:");

  for (const step of plan.steps) {
    if (step._tag === "UninstallSkill") {
      const agentInfo = step.agents.length > 0 ? ` @ ${step.agents.join(", ")}` : "";
      p.log.message(`  - ${step.skill}${agentInfo} (uninstall)`);
    }
  }

  const summary = getPlanSummary(plan);
  p.log.message("");
  p.log.message(`  Summary: ${summary.uninstalled} skill(s) to uninstall`);
};

/**
 * Display the uninstall plan in human-readable format (for partial uninstall).
 */
const displayPartialPlan = (skillName: string, agents: readonly string[]): void => {
  p.log.info("Plan:");
  p.log.message("");
  p.log.message("  Skills:");
  p.log.message(`  - ${skillName} @ ${agents.join(", ")} (uninstall)`);
  p.log.message("");
  p.log.message("  Summary: 1 skill to uninstall");
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
 * 5. Build plan (diff current vs ideal)
 * 6. Display plan (dry-run stops here)
 * 7. Confirm and apply changes
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleUninstall = (
  args: UninstallArgs,
): Effect.Effect<void, UninstallError, FileSystem.FileSystem | Path.Path> => {
  return Effect.gen(function* () {
    // Create workspace context (V2) - always local for uninstall
    const ws: WorkspaceContext = makeWorkspaceContext({
      global: false,
      interactive: isInteractive(),
    });

    // Show intro
    p.intro("axm skills uninstall");

    // Create spinner helper (auto-detects TTY)
    const spinnerHelper = createSpinnerHelper();

    // Step 1: Ensure initialized via WorkspaceContext
    spinnerHelper.start("Checking initialization...");
    yield* ensureInit(ws).pipe(
      Effect.mapError(
        (error) =>
          new UninstallError({
            message: error.message,
            cause: error,
            retryable: false,
          }),
      ),
    );
    spinnerHelper.stop("Initialized");

    // Step 2: Load current state using V2 API
    spinnerHelper.start("Loading current state...");
    const currentState = yield* loadCurrentState(ws).pipe(
      Effect.mapError(
        (error: { message: string }) =>
          new UninstallError({
            message: `Failed to load state: ${error.message}`,
            cause: error,
            retryable: false,
          }),
      ),
    );
    spinnerHelper.stop("Loaded current state");

    // Step 3: Validate skill exists in current state
    // Find skill by name in the skills array
    const skillState = currentState.skills.find((s) => s.name === args.skill);
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
    // We need to determine if this is a partial or full uninstall
    const isPartialUninstall = args.agent.length > 0;

    // For partial uninstall, we need to handle it differently since
    // the V2 buildIdealForUninstall doesn't support partial agent removal.
    // Only use the full state-based pattern for complete uninstalls.
    if (isPartialUninstall) {
      yield* handlePartialUninstall(args, ws, spinnerHelper);
    } else {
      yield* handleFullUninstall(args, ws, spinnerHelper);
    }
  });
};

/**
 * Handle full uninstall using the V2 state-based reconciliation pattern.
 */
const handleFullUninstall = (
  args: UninstallArgs,
  ws: WorkspaceContext,
  spinnerHelper: ReturnType<typeof createSpinnerHelper>,
): Effect.Effect<void, UninstallError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    // Load current state again (needed for buildPlan)
    const currentState = yield* loadCurrentState(ws).pipe(
      Effect.mapError(
        (error: { message: string }) =>
          new UninstallError({
            message: `Failed to load state: ${error.message}`,
            cause: error,
            retryable: false,
          }),
      ),
    );

    // Step 4: Build ideal state with skill removed using V2 API
    spinnerHelper.start("Building uninstall plan...");
    const uninstallCmd: UninstallCommand = {
      _tag: "skills-uninstall",
      skills: [args.skill],
    };
    const idealState = yield* buildIdealForUninstall(currentState, uninstallCmd).pipe(
      Effect.mapError(
        (error: { message: string }) =>
          new UninstallError({
            message: `Failed to build ideal state: ${error.message}`,
            cause: error,
            retryable: false,
          }),
      ),
    );
    spinnerHelper.stop("Built uninstall plan");

    // Step 5: Build plan using V2 API
    const plan = buildPlan(currentState, idealState);

    // Check if there are changes
    if (!planHasChanges(plan)) {
      p.log.info("No changes needed.");
      p.outro("Nothing to do.");
      return;
    }

    // Step 6: Display plan
    displayPlanFromPlan(plan);

    // Dry-run stops here
    if (args.dryRun) {
      p.outro("Dry-run complete. No changes made.");
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

    // Step 8: Apply changes using V2 applyPlan
    spinnerHelper.start(`Uninstalling ${args.skill}...`);

    // Get agent configs for the apply operation
    // For full uninstall, we need agents from the plan step
    const uninstallStep = plan.steps.find(
      (s): s is PlanStep & { _tag: "UninstallSkill" } => s._tag === "UninstallSkill",
    );
    const agentConfigs: AgentConfig[] = uninstallStep
      ? uninstallStep.agents
          .map((id) => getAgentById(id))
          .filter(Option.isSome)
          .map((opt) => opt.value)
      : [];

    // Create apply deps
    const deps: ApplyDeps<FileSystem.FileSystem> = {
      applyStep: (step: PlanStep) =>
        applyStep(step, { workspacePath: ws.path, agents: agentConfigs }),
      updateLockfile: (p: Plan) => updateLockfileForPlan(ws.path, p),
      updateSettings: (p: Plan) => updateSettingsForPlan(ws.path, p),
    };

    const applyResult = yield* applyPlan(ws, plan, { dryRun: false }, deps).pipe(
      Effect.mapError(
        (error: { message: string }) =>
          new UninstallError({
            message: `Failed to apply changes: ${error.message}`,
            cause: error,
            retryable: false,
          }),
      ),
    );

    spinnerHelper.stop(`Uninstalled ${args.skill}`);

    // Show completion
    if (applyResult.failed.length > 0) {
      for (const failure of applyResult.failed) {
        p.log.error(`${failure.step.skill}: ${failure.error.message}`);
      }
    }
    p.log.success(`Successfully uninstalled ${args.skill}`);
    p.outro("Done.");
  });

/**
 * Handle partial uninstall (--agent flag) - removes skill from specific agents only.
 *
 * Note: The V2 buildIdealForUninstall doesn't support partial agent removal,
 * so we handle this case by constructing a targeted Plan and using applyPlan.
 */
const handlePartialUninstall = (
  args: UninstallArgs,
  ws: WorkspaceContext,
  spinnerHelper: ReturnType<typeof createSpinnerHelper>,
): Effect.Effect<void, UninstallError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    // Read lockfile to get current agents
    const lockfile = yield* readLockfile(ws.path).pipe(
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
    spinnerHelper.start("Building uninstall plan...");
    spinnerHelper.stop("Built uninstall plan");

    // Display plan
    displayPartialPlan(args.skill, targetAgents);

    // Dry-run stops here
    if (args.dryRun) {
      p.outro("Dry-run complete. No changes made.");
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
    spinnerHelper.start(`Uninstalling ${args.skill}...`);

    // Get agent configs for removal
    const agentConfigs: AgentConfig[] = targetAgents
      .map((id) => getAgentById(id))
      .filter(Option.isSome)
      .map((opt) => opt.value);

    if (isFullRemoval) {
      // This became a full removal - use V2 state-based pattern with applyPlan
      const currentState = yield* loadCurrentState(ws).pipe(
        Effect.mapError(
          (error: { message: string }) =>
            new UninstallError({
              message: `Failed to load state: ${error.message}`,
              cause: error,
              retryable: false,
            }),
        ),
      );

      const uninstallCmd: UninstallCommand = {
        _tag: "skills-uninstall",
        skills: [args.skill],
      };
      const idealState = yield* buildIdealForUninstall(currentState, uninstallCmd).pipe(
        Effect.mapError(
          (error: { message: string }) =>
            new UninstallError({
              message: `Failed to build ideal state: ${error.message}`,
              cause: error,
              retryable: false,
            }),
        ),
      );

      const plan = buildPlan(currentState, idealState);

      // Create apply deps
      const deps: ApplyDeps<FileSystem.FileSystem> = {
        applyStep: (step: PlanStep) =>
          applyStep(step, { workspacePath: ws.path, agents: agentConfigs }),
        updateLockfile: (p: Plan) => updateLockfileForPlan(ws.path, p),
        updateSettings: (p: Plan) => updateSettingsForPlan(ws.path, p),
      };

      yield* applyPlan(ws, plan, { dryRun: false }, deps).pipe(
        Effect.mapError(
          (error: { message: string }) =>
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
      yield* updateLockEntry(ws.path, args.skill, {
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

    spinnerHelper.stop(`Uninstalled ${args.skill}`);

    // Show completion
    if (isFullRemoval) {
      p.log.success(`Successfully uninstalled ${args.skill}`);
    } else {
      p.log.success(`Successfully removed ${args.skill} from ${targetAgents.join(", ")}`);
      p.log.info(`Skill remains installed for: ${remainingAgents.join(", ")}`);
    }
    p.outro("Done.");
  });

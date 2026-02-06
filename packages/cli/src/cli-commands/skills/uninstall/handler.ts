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
import { type AgentConfig, getAgentById } from "../../../agents/index.js";
import { readLockfile, updateLockEntry } from "../../../lockfile/index.js";
import {
  type ApplyDeps,
  applyPlan,
  applyStep,
  buildIdealFromOperations,
  buildPlan,
  ensureInitLegacy,
  loadCurrentState,
  makeWorkspaceContextLegacy,
  type Plan,
  type PlanStep,
  planHasChanges,
  type RemoveSkillOperation,
  updateLockfileForPlan,
  updateSettingsForPlan,
  type WorkspaceContextLegacy,
} from "../../../workspace/index.js";
import { displayPlan } from "../display.js";
import * as FileSystem from "@effect/platform/FileSystem";
import type { Path } from "@effect/platform";
import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import { Clack, PromptCancelled, PromptError } from "../../../clack-effect/index.js";
import type { Spinner } from "../../../clack-effect/types.js";
import { formatError } from "../../../utils/errors.js";
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
  readonly cause: Option.Option<unknown>;
  readonly retryable: boolean;
}> {}

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
): Effect.Effect<
  void,
  UninstallError | PromptCancelled | PromptError,
  FileSystem.FileSystem | Path.Path | Clack
> => {
  return Effect.gen(function* () {
    const clack = yield* Clack;

    // Create workspace context (legacy) - always local for uninstall
    const ws: WorkspaceContextLegacy = makeWorkspaceContextLegacy({
      global: false,
      interactive: isInteractive(),
    });

    // Show intro
    yield* clack.intro("axm skills uninstall");

    // Create spinner
    const spinner = yield* clack.spinner();

    // Step 1: Ensure initialized via WorkspaceContextLegacy
    spinner.start("Checking initialization...");
    yield* ensureInitLegacy(ws).pipe(
      Effect.mapError(
        (error) =>
          new UninstallError({
            message: error.message,
            cause: Option.some(error),
            retryable: false,
          }),
      ),
    );
    spinner.stop("Initialized");

    // Step 2: Load current state using V2 API
    spinner.start("Loading current state...");
    const currentState = yield* loadCurrentState(ws).pipe(
      Effect.mapError(
        (error) =>
          new UninstallError({
            message: `Failed to load state: ${error.message}`,
            cause: Option.some(error),
            retryable: false,
          }),
      ),
    );
    spinner.stop("Loaded current state");

    // Step 3: Validate skill exists in current state
    // Find skill by name in the skills array
    const skillStateOption = Array.findFirst(currentState.skills, (s) => s.name === args.skill);
    if (Option.isNone(skillStateOption) || Option.isNone(skillStateOption.value.locked)) {
      return yield* Effect.fail(
        new UninstallError({
          message: formatError(
            `Skill '${args.skill}' is not installed`,
            [],
            "Use 'axm skills list' to see installed skills.",
          ),
          cause: Option.none(),
          retryable: false,
        }),
      );
    }

    // Get the current agents from the locked state
    // We need to determine if this is a partial or full uninstall
    const isPartialUninstall = args.agent.length > 0;

    // For partial uninstall, we need to handle it differently since
    // buildIdealFromOperations doesn't support partial agent removal.
    // Only use the full state-based pattern for complete uninstalls.
    if (isPartialUninstall) {
      yield* handlePartialUninstall(args, ws, clack, spinner);
    } else {
      yield* handleFullUninstall(args, ws, clack, spinner);
    }
  });
};

/**
 * Handle full uninstall using the V2 state-based reconciliation pattern.
 */
const handleFullUninstall = (
  args: UninstallArgs,
  ws: WorkspaceContextLegacy,
  clack: Clack["Type"],
  spinner: Spinner,
): Effect.Effect<
  void,
  UninstallError | PromptCancelled | PromptError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    // Load current state again (needed for buildPlan)
    const currentState = yield* loadCurrentState(ws).pipe(
      Effect.mapError(
        (error) =>
          new UninstallError({
            message: `Failed to load state: ${error.message}`,
            cause: Option.some(error),
            retryable: false,
          }),
      ),
    );

    // Step 4: Build ideal state with skill removed
    spinner.start("Building uninstall plan...");
    const ops: RemoveSkillOperation[] = [{ _tag: "remove-skill", name: args.skill }];
    const idealState = yield* buildIdealFromOperations(currentState, ops).pipe(
      Effect.mapError(
        (error) =>
          new UninstallError({
            message: `Failed to build ideal state: ${error.message}`,
            cause: Option.some(error),
            retryable: false,
          }),
      ),
    );
    spinner.stop("Built uninstall plan");

    // Step 5: Build plan using V2 API
    const plan = buildPlan(currentState, idealState);

    // Check if there are changes
    if (!planHasChanges(plan)) {
      yield* clack.log.info("No changes needed.");
      yield* clack.outro("Nothing to do.");
      return;
    }

    // Step 6: Display plan
    yield* displayPlan(clack, plan);

    // Dry-run stops here
    if (args.dryRun) {
      yield* clack.outro("Dry-run complete. No changes made.");
      return;
    }

    // Step 7: Confirm uninstallation (unless --yes)
    if (!args.yes) {
      if (!isInteractive()) {
        return yield* Effect.fail(
          new UninstallError({
            message: formatError(
              "Cannot prompt for confirmation",
              ["stdin is not a TTY"],
              "Use --yes to run without prompts.",
            ),
            cause: Option.none(),
            retryable: false,
          }),
        );
      }
      const confirmed = yield* clack.confirm("Apply changes?");
      if (!confirmed) {
        yield* clack.outro("Uninstallation cancelled.");
        return;
      }
    }

    // Step 8: Apply changes using V2 applyPlan
    spinner.start(`Uninstalling ${args.skill}...`);

    // Get agent configs for the apply operation
    // For full uninstall, we need agents from the plan step
    const uninstallStepOption = Array.findFirst(
      plan.steps,
      (s): s is PlanStep & { _tag: "UninstallSkill" } => s._tag === "UninstallSkill",
    );
    const agentConfigs: AgentConfig[] = Option.match(uninstallStepOption, {
      onNone: () => [],
      onSome: (step) =>
        pipe(
          step.agents,
          Array.map((id) => getAgentById(id)),
          Array.getSomes,
        ),
    });

    // Create apply deps
    const deps: ApplyDeps<FileSystem.FileSystem> = {
      applyStep: (step: PlanStep) =>
        applyStep(step, { workspacePath: ws.path, agents: agentConfigs }),
      updateLockfile: (p: Plan) => updateLockfileForPlan(ws.path, p),
      updateSettings: (p: Plan) => updateSettingsForPlan(ws.path, p),
    };

    const applyResult = yield* applyPlan(plan, { dryRun: false }, deps).pipe(
      Effect.mapError(
        (error) =>
          new UninstallError({
            message: `Failed to apply changes: ${error.message}`,
            cause: Option.some(error),
            retryable: false,
          }),
      ),
    );

    spinner.stop(`Uninstalled ${args.skill}`);

    // Show completion
    if (applyResult.failed.length > 0) {
      for (const failure of applyResult.failed) {
        yield* clack.log.error(`${failure.step.skill}: ${failure.error.message}`);
      }
    }
    yield* clack.log.success(`Successfully uninstalled ${args.skill}`);
    yield* clack.outro("Done.");
  });

/**
 * Handle partial uninstall (--agent flag) - removes skill from specific agents only.
 *
 * Note: The V2 buildIdealForUninstall doesn't support partial agent removal,
 * so we handle this case by constructing a targeted Plan and using applyPlan.
 */
const handlePartialUninstall = (
  args: UninstallArgs,
  ws: WorkspaceContextLegacy,
  clack: Clack["Type"],
  spinner: Spinner,
): Effect.Effect<
  void,
  UninstallError | PromptCancelled | PromptError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    // Read lockfile to get current agents
    const lockfile = yield* readLockfile(ws.path).pipe(
      Effect.mapError(
        (error) =>
          new UninstallError({
            message: `Failed to read lockfile: ${error.message}`,
            cause: Option.some(error),
            retryable: false,
          }),
      ),
    );

    const lockEntry = lockfile.skills[args.skill];
    if (!lockEntry) {
      return yield* Effect.fail(
        new UninstallError({
          message: formatError(
            `Skill '${args.skill}' is not installed`,
            [],
            "Use 'axm skills list' to see installed skills.",
          ),
          cause: Option.none(),
          retryable: false,
        }),
      );
    }

    const currentAgents = lockEntry.agents;
    const targetAgents = args.agent;
    const remainingAgents = Array.filter(currentAgents, (a) => !targetAgents.includes(a));

    // Check if this will become a full removal
    const isFullRemoval = remainingAgents.length === 0;

    // Build plan
    spinner.start("Building uninstall plan...");
    spinner.stop("Built uninstall plan");

    // Display plan - construct a synthetic plan for partial uninstall
    const partialPlan: Plan = {
      steps: [{ _tag: "UninstallSkill", skill: args.skill, agents: [...targetAgents] }],
    };
    yield* displayPlan(clack, partialPlan);

    // Dry-run stops here
    if (args.dryRun) {
      yield* clack.outro("Dry-run complete. No changes made.");
      return;
    }

    // Confirm uninstallation (unless --yes)
    if (!args.yes) {
      if (!isInteractive()) {
        return yield* Effect.fail(
          new UninstallError({
            message: formatError(
              "Cannot prompt for confirmation",
              ["stdin is not a TTY"],
              "Use --yes to run without prompts.",
            ),
            cause: Option.none(),
            retryable: false,
          }),
        );
      }
      const confirmed = yield* clack.confirm("Apply changes?");
      if (!confirmed) {
        yield* clack.outro("Uninstallation cancelled.");
        return;
      }
    }

    // Apply changes
    spinner.start(`Uninstalling ${args.skill}...`);

    // Get agent configs for removal
    const agentConfigs: AgentConfig[] = pipe(
      targetAgents,
      Array.map((id) => getAgentById(id)),
      Array.getSomes,
    );

    if (isFullRemoval) {
      // This became a full removal - use V2 state-based pattern with applyPlan
      const currentState = yield* loadCurrentState(ws).pipe(
        Effect.mapError(
          (error) =>
            new UninstallError({
              message: `Failed to load state: ${error.message}`,
              cause: Option.some(error),
              retryable: false,
            }),
        ),
      );

      const removeOps: RemoveSkillOperation[] = [{ _tag: "remove-skill", name: args.skill }];
      const idealState = yield* buildIdealFromOperations(currentState, removeOps).pipe(
        Effect.mapError(
          (error) =>
            new UninstallError({
              message: `Failed to build ideal state: ${error.message}`,
              cause: Option.some(error),
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

      yield* applyPlan(plan, { dryRun: false }, deps).pipe(
        Effect.mapError(
          (error) =>
            new UninstallError({
              message: `Failed to apply changes: ${error.message}`,
              cause: Option.some(error),
              retryable: false,
            }),
        ),
      );
    } else {
      // Partial removal - remove symlinks from target agents but keep canonical
      yield* Effect.all(
        agentConfigs.map((agent) =>
          Effect.gen(function* () {
            const agentSkillsDir = agent.skills.dir;
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
              cause: Option.some(error),
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
              cause: Option.some(error),
              retryable: false,
            }),
        ),
      );
    }

    spinner.stop(`Uninstalled ${args.skill}`);

    // Show completion
    if (isFullRemoval) {
      yield* clack.log.success(`Successfully uninstalled ${args.skill}`);
    } else {
      yield* clack.log.success(
        `Successfully removed ${args.skill} from ${targetAgents.join(", ")}`,
      );
      yield* clack.log.info(`Skill remains installed for: ${remainingAgents.join(", ")}`);
    }
    yield* clack.outro("Done.");
  });

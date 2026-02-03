/**
 * Init command handler - Effect-based orchestration for `axm init`.
 *
 * Uses state-based architecture:
 * 1. Detect agents (or use --agent flag)
 * 2. Load actual init state from disk
 * 3. Build ideal state from agents and scope
 * 4. Compute diff (the plan)
 * 5. Display plan (dry-run stops here)
 * 6. Apply changes (if not dry-run)
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as os from "node:os";
import * as path from "node:path";
import {
  type AgentConfig,
  detectAgents,
  getAgentById,
  getSupportedAgentIds,
} from "@agentxm/core/experimental/skills";
import {
  type ApplyInitError,
  applyInitDiff,
  buildIdealInitState,
  computeInitDiff,
  hasInitChanges,
  type IdealInitState,
  type InitChange,
  type InvalidWorkspaceError,
  loadActualInitState,
} from "@agentxm/core/experimental/workspace-init";
import * as p from "@clack/prompts";
import type { FileSystem } from "@effect/platform";
import { Data, Effect, pipe } from "effect";
import { formatError } from "../../utils/errors.js";
import { promptMultiselect } from "../../utils/prompts.js";
import { createSpinnerHelper } from "../../utils/spinner.js";
import { isInteractive } from "../../utils/tty.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the init command.
 */
export interface InitArgs {
  /** Initialize globally in ~/.axm/ instead of ./.axm/ */
  readonly global: boolean;
  /** Target agent(s) to configure (overrides detection) */
  readonly agent: readonly string[];
  /** Skip confirmations and use all detected agents */
  readonly yes: boolean;
  /** Re-initialize even if already initialized */
  readonly force: boolean;
  /** Preview initialization plan without making changes */
  readonly dryRun: boolean;
  /** Increase output detail */
  readonly verbose?: boolean | undefined;
  /** Suppress non-essential output */
  readonly quiet?: boolean | undefined;
  /** Output as JSON */
  readonly json?: boolean | undefined;
  /** Disable all prompts */
  readonly nonInteractive?: boolean | undefined;
}

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

/**
 * Error that occurs during initialization.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class InitError extends Data.TaggedError("InitError")<{
  readonly message: string;
  readonly cause?: unknown;
  readonly retryable: boolean;
}> {}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Determines the .axm directory path based on global flag.
 */
const getAxmDir = (global: boolean): string =>
  global ? path.join(os.homedir(), ".axm") : path.join(process.cwd(), ".axm");

/**
 * Validates that specified agent IDs exist in the supported list.
 */
const validateAgentIds = (agentIds: readonly string[]): Effect.Effect<void, InitError> => {
  const supportedIds = getSupportedAgentIds();
  const invalidIds = agentIds.filter((id) => !supportedIds.includes(id));

  if (invalidIds.length > 0) {
    // Show first 6 valid agent IDs as suggestions
    const suggestions = supportedIds.slice(0, 6).join(", ");
    return Effect.fail(
      new InitError({
        message: formatError(
          `Unknown agent(s): ${invalidIds.join(", ")}`,
          [`Valid agents include: ${suggestions}, ...`],
          "Run 'axm init --help' to see all supported agents.",
        ),
        cause: { invalidIds, supportedIds },
        retryable: false,
      }),
    );
  }
  return Effect.void;
};

/**
 * Maps detection error to init error.
 */
const detectAgentsWithErrorMapping = (): Effect.Effect<
  AgentConfig[],
  InitError,
  FileSystem.FileSystem
> =>
  pipe(
    detectAgents(),
    Effect.mapError(
      (error) =>
        new InitError({
          message: `Failed to detect agents: ${error.message}`,
          cause: error,
          retryable: false,
        }),
    ),
  );

/**
 * Selects agents based on args and detected agents.
 * Returns AgentConfig[] for selected agents.
 */
const selectAgents = (
  args: InitArgs,
  detectedAgents: AgentConfig[],
): Effect.Effect<AgentConfig[], InitError> => {
  if (args.agent.length > 0) {
    // Use explicitly specified agents
    return pipe(
      validateAgentIds(args.agent),
      Effect.map(() => {
        const agents = [...args.agent]
          .map((id) => getAgentById(id))
          .filter((a): a is AgentConfig => a !== undefined);
        p.log.info(`Using specified agents: ${agents.map((a) => a.name).join(", ")}`);
        return agents;
      }),
    );
  }

  if (args.yes || args.nonInteractive || args.dryRun) {
    // Auto-select all detected agents in non-interactive mode
    if (detectedAgents.length === 0) {
      p.log.warn("No agents detected. Use --agent to specify agents manually.");
      return Effect.succeed<AgentConfig[]>([]);
    }
    p.log.info(
      `Auto-selecting all detected agents: ${detectedAgents.map((a) => a.name).join(", ")}`,
    );
    return Effect.succeed(detectedAgents);
  }

  // Check if we can prompt interactively
  if (!isInteractive()) {
    return Effect.fail(
      new InitError({
        message: formatError(
          "Cannot prompt for agent selection",
          ["stdin is not a TTY"],
          "Use --yes or --non-interactive to auto-select detected agents.",
        ),
        cause: { reason: "stdin is not a TTY", detectedAgentCount: detectedAgents.length },
        retryable: false,
      }),
    );
  }

  // Interactive mode - prompt for selection
  if (detectedAgents.length === 0) {
    p.log.warn("No agents detected. You can add agents later with 'axm init --agent <id>'.");
    return Effect.succeed<AgentConfig[]>([]);
  }

  return promptMultiselect("Select agents to configure", detectedAgents, {
    toOption: (a) => {
      const opt: { value: string; label: string; hint?: string } = {
        value: a.id,
        label: a.name,
      };
      if (a.skillsDir) {
        opt.hint = `skills: ${a.skillsDir}`;
      }
      return opt;
    },
    initialValues: detectedAgents.map((a) => a.id),
    required: false,
  }).pipe(
    Effect.mapError(
      (error) =>
        new InitError({
          message: "Failed to prompt for agent selection",
          cause: error,
          retryable: false,
        }),
    ),
  );
};

/**
 * Format an InitChange for display.
 */
const formatChange = (change: InitChange): string => {
  switch (change._tag) {
    case "Add": {
      const agentList = change.ideal.agents.map((a: AgentConfig) => a.id).join(", ");
      return `+ Create ${change.ideal.agents.length > 0 ? `with agents: ${agentList}` : "(no agents)"}`;
    }
    case "Update": {
      const agentList = change.to.agents.map((a: AgentConfig) => a.id).join(", ");
      return `~ Update agents to: ${agentList || "(none)"}`;
    }
    case "Unchanged":
      return `  Already initialized (no changes)`;
    default: {
      // Exhaustive check
      const _exhaustive: never = change;
      return _exhaustive;
    }
  }
};

/**
 * Display the initialization plan.
 */
const displayPlan = (change: InitChange, axmDir: string): void => {
  p.log.info("Plan:");
  p.log.message("");
  p.log.message(`  Settings: ${axmDir}/settings.json`);
  p.log.message(`  ${formatChange(change)}`);
  p.log.message("");
};

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm init` command.
 *
 * Flow (state-based architecture):
 * 1. Detect installed agents (or use --agent flag)
 * 2. Load actual init state from disk
 * 3. Handle invalid state (error)
 * 4. Build ideal state from selected agents
 * 5. Compute diff (the plan)
 * 6. Display plan (dry-run stops here)
 * 7. Apply changes (if not dry-run and has changes)
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleInit = (
  args: InitArgs,
): Effect.Effect<void, InitError, FileSystem.FileSystem> => {
  const axmDir = getAxmDir(args.global);
  const scopeLabel = args.global ? "global" : "project";

  return Effect.gen(function* () {
    // Show intro
    p.intro(`axm init (${scopeLabel})`);

    // Create spinner helper (auto-detects TTY)
    const spinnerHelper = createSpinnerHelper();

    // Step 1: Detect installed agents
    spinnerHelper.start("Detecting installed agents...");
    const detectedAgents = yield* detectAgentsWithErrorMapping();
    const message =
      detectedAgents.length > 0
        ? `Found ${detectedAgents.length} agent(s): ${detectedAgents.map((a) => a.name).join(", ")}`
        : "No agents detected";
    spinnerHelper.stop(message);

    // Step 2: Select agents
    const selectedAgents = yield* selectAgents(args, detectedAgents);

    // Step 3: Load actual init state
    spinnerHelper.start("Checking initialization state...");
    const actualState = yield* loadActualInitState(axmDir);
    spinnerHelper.stop("Loaded initialization state");

    // Step 4: Handle invalid state
    if (actualState.validity._tag === "Invalid") {
      return yield* new InitError({
        message: formatError(
          "Workspace has invalid settings",
          [actualState.validity.error],
          "Fix or remove the invalid settings file and try again.",
        ),
        cause: { validity: actualState.validity },
        retryable: false,
      });
    }

    // Step 5: Build ideal state
    const idealState: IdealInitState = buildIdealInitState(selectedAgents);

    // Step 6: Compute diff
    const diff = yield* computeInitDiff(actualState, idealState, { force: args.force }).pipe(
      Effect.mapError(
        (error: InvalidWorkspaceError) =>
          new InitError({
            message: formatError(
              "Workspace has invalid settings",
              [error.message],
              "Fix or remove the invalid settings file and try again.",
            ),
            cause: error,
            retryable: false,
          }),
      ),
    );

    // Step 7: Display plan
    displayPlan(diff.change, axmDir);

    // Step 8: Dry-run stops here
    if (args.dryRun) {
      p.outro("Dry-run complete. No changes made.");
      return;
    }

    // Step 9: Check if there are changes to apply
    if (!hasInitChanges(diff)) {
      const agentNames =
        actualState.validity._tag === "Valid"
          ? (actualState.validity.settings.agents ?? [])
              .map((id: string) => getAgentById(id)?.name ?? id)
              .join(", ")
          : "";
      p.log.info(`Already initialized with agents: ${agentNames || "(none)"}`);
      p.log.info(`Settings location: ${axmDir}/settings.json`);
      p.outro("Nothing to do.");
      return;
    }

    // Step 10: Apply changes
    spinnerHelper.start("Applying initialization...");
    yield* applyInitDiff(diff.change, { axmDir }).pipe(
      Effect.mapError(
        (error: ApplyInitError) =>
          new InitError({
            message: formatError(
              `Failed to ${error.operation === "createDirectory" ? "create directory" : "write settings"}`,
              [error.message],
              "Check that you have write permissions for this directory.",
            ),
            cause: error,
            retryable: false,
          }),
      ),
    );
    spinnerHelper.stop(`Created ${axmDir}/settings.json`);

    // Show success
    const agentNames = selectedAgents.map((a) => a.name).join(", ");
    p.outro(
      selectedAgents.length > 0
        ? `Initialized with agents: ${agentNames}`
        : "Initialized (no agents selected)",
    );
  }).pipe(Effect.asVoid);
};

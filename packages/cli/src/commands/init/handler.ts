/**
 * Init command handler - Effect-based orchestration for `axm init`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as os from "node:os";
import * as path from "node:path";
import {
  type AgentConfig,
  createDefaultSettings,
  detectAgents,
  getAgentById,
  getSupportedAgentIds,
  readSettings,
  type Settings,
  type SettingsError,
  writeSettings,
} from "@agentxm/core/experimental/skills";
import * as p from "@clack/prompts";
import type { FileSystem } from "@effect/platform";
import { Data, Effect, pipe } from "effect";

/**
 * Asserts that a prompt result is not a cancel symbol.
 *
 * TypeScript doesn't narrow after `p.isCancel()` check, so this assertion
 * function bridges the gap after cancel has been handled.
 */
function assertNotCancel<T>(result: T | symbol): asserts result is T {
  if (typeof result === "symbol") {
    throw new Error("Unexpected cancel symbol after isCancel check");
  }
}

import { formatError } from "../../utils/errors.js";
import { isFancyOutput, isInteractive } from "../../utils/tty.js";

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
 * Wraps @clack/prompts multiselect in an Effect.
 */
const promptAgentSelection = (agents: readonly AgentConfig[]): Effect.Effect<string[], InitError> =>
  Effect.tryPromise({
    try: async () => {
      const options = agents.map((a) => {
        const opt: { value: string; label: string; hint?: string } = {
          value: a.id,
          label: a.name,
        };
        if (a.skillsDir) {
          opt.hint = `skills: ${a.skillsDir}`;
        }
        return opt;
      });

      const result = await p.multiselect({
        message: "Select agents to configure",
        options,
        initialValues: agents.map((a) => a.id),
        required: true,
      });

      // User cancelled (Ctrl+C)
      if (p.isCancel(result)) {
        p.cancel("Operation cancelled.");
        process.exit(0);
      }

      assertNotCancel(result);
      return result;
    },
    catch: (error) =>
      new InitError({
        message: "Failed to prompt for agent selection",
        cause: error,
        retryable: false,
      }),
  });

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
 * Checks if already initialized by attempting to read settings.
 * Returns the existing settings if found, or undefined if not initialized.
 */
const checkExistingSettings = (
  axmDir: string,
): Effect.Effect<Settings | undefined, InitError, FileSystem.FileSystem> =>
  pipe(
    readSettings(axmDir),
    Effect.map((settings): Settings | undefined => settings),
    Effect.catchAll((error: SettingsError) => {
      if (error._tag === "SettingsNotFoundError") {
        return Effect.succeed<Settings | undefined>(undefined);
      }
      return Effect.fail(
        new InitError({
          message: `Failed to check existing settings: ${error.message}`,
          cause: error,
          retryable: false,
        }),
      );
    }),
  );

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
 * Maps settings write error to init error.
 */
const writeSettingsWithErrorMapping = (
  axmDir: string,
  settings: Settings,
): Effect.Effect<void, InitError, FileSystem.FileSystem> =>
  pipe(
    writeSettings(axmDir, settings),
    Effect.mapError(
      (error) =>
        new InitError({
          message: formatError(
            "Failed to write settings",
            [`Path: ${axmDir}/settings.json`],
            "Check that you have write permissions for this directory.",
          ),
          cause: error,
          retryable: false,
        }),
    ),
  );

/**
 * Selects agents based on args and detected agents.
 */
const selectAgents = (
  args: InitArgs,
  detectedAgents: AgentConfig[],
): Effect.Effect<string[], InitError> => {
  if (args.agent.length > 0) {
    // Use explicitly specified agents
    return pipe(
      validateAgentIds(args.agent),
      Effect.map(() => {
        p.log.info(`Using specified agents: ${[...args.agent].join(", ")}`);
        return [...args.agent];
      }),
    );
  }

  if (args.yes || args.nonInteractive) {
    // Auto-select all detected agents in non-interactive mode
    const selectedAgentIds = detectedAgents.map((a) => a.id);
    if (selectedAgentIds.length === 0) {
      return Effect.fail(
        new InitError({
          message: "No agents detected. Use --agent to specify agents manually.",
          cause: { detectedAgents: [] },
          retryable: false,
        }),
      );
    }
    p.log.info(`Auto-selecting all detected agents: ${selectedAgentIds.join(", ")}`);
    return Effect.succeed(selectedAgentIds);
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
    return Effect.succeed<string[]>([]);
  }

  return promptAgentSelection(detectedAgents);
};

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm init` command.
 *
 * Flow:
 * 1. Determine axmDir (global or project-level)
 * 2. Check if already initialized
 * 3. Detect installed agents
 * 4. Select agents (via --agent flag, --yes flag, or interactive prompt)
 * 5. Write settings.json with selected agents
 * 6. Show success message
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleInit = (
  args: InitArgs,
): Effect.Effect<void, InitError, FileSystem.FileSystem> => {
  const axmDir = getAxmDir(args.global);
  const scopeLabel = args.global ? "global" : "project";

  return pipe(
    // Show intro
    Effect.sync(() => {
      p.intro(`axm init (${scopeLabel})`);
    }),

    // Check if already initialized
    Effect.flatMap(() => checkExistingSettings(axmDir)),
    Effect.flatMap((existingSettings) => {
      if (existingSettings) {
        const agentNames = existingSettings.agents
          .map((id) => getAgentById(id)?.name ?? id)
          .join(", ");
        p.log.info(`Already initialized with agents: ${agentNames || "(none)"}`);
        p.log.info(`Settings location: ${axmDir}/settings.json`);
        p.outro("Nothing to do.");
        return Effect.void;
      }

      // Continue with initialization
      const useFancyOutput = isFancyOutput();
      const spinner = useFancyOutput ? p.spinner() : null;

      return pipe(
        // Detect installed agents
        Effect.sync(() => {
          if (spinner) {
            spinner.start("Detecting installed agents...");
          } else {
            p.log.info("Detecting installed agents...");
          }
        }),
        Effect.flatMap(() => detectAgentsWithErrorMapping()),
        Effect.tap((detectedAgents) =>
          Effect.sync(() => {
            const message =
              detectedAgents.length > 0
                ? `Found ${detectedAgents.length} agent(s): ${detectedAgents.map((a) => a.name).join(", ")}`
                : "No agents detected";
            if (spinner) {
              spinner.stop(message);
            } else {
              p.log.info(message);
            }
          }),
        ),

        // Select agents
        Effect.flatMap((detectedAgents) => selectAgents(args, detectedAgents)),

        // Write settings
        Effect.flatMap((selectedAgentIds) => {
          const settings: Settings = {
            ...createDefaultSettings(),
            agents: selectedAgentIds,
          };

          if (spinner) {
            spinner.start("Writing settings...");
          } else {
            p.log.info("Writing settings...");
          }

          return pipe(
            writeSettingsWithErrorMapping(axmDir, settings),
            Effect.tap(() =>
              Effect.sync(() => {
                const createdMessage = `Created ${axmDir}/settings.json`;
                if (spinner) {
                  spinner.stop(createdMessage);
                } else {
                  p.log.info(createdMessage);
                }

                // Show success
                const agentNames = selectedAgentIds
                  .map((id) => getAgentById(id)?.name ?? id)
                  .join(", ");
                p.outro(
                  selectedAgentIds.length > 0
                    ? `Initialized with agents: ${agentNames}`
                    : "Initialized (no agents selected)",
                );
              }),
            ),
          );
        }),
      );
    }),
  );
};

/**
 * Shared utility for resolving agents from CLI flags or settings.
 *
 * Validates agent IDs against the registry, prompts to add unconfigured agents
 * to the workspace, and fails if no agents result.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { pipe } from "effect/Function";
import { type AgentDescriptor, getAgentById } from "../agents/index.js";
import { makeCliError } from "../cli-error/index.js";
import { Confirm, Log } from "../tui/index.js";
import { Workspace } from "./service.js";
import { isInteractive } from "../utils/tty.js";

// -----------------------------------------------------------------------------
// Options
// -----------------------------------------------------------------------------

/**
 * Options for ensureAgentsConfigured.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface EnsureAgentsOptions {
  /** Agent IDs from --agent CLI flag */
  readonly agentFlags: readonly string[];
  /** Skip confirmation prompts */
  readonly yes: boolean;
  /** Disable all prompts */
  readonly nonInteractive: boolean;
}

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

/**
 * Resolve agents from CLI flags or settings.
 *
 * When `--agent` flags are provided:
 * 1. Validates each ID against the agent registry, warns about unknown IDs
 * 2. Checks which valid agents are not yet in settings
 * 3. Prompts to add unconfigured agents (or auto-adds with --yes/--non-interactive)
 * 4. Returns resolved AgentDescriptor[]
 *
 * When no flags are provided:
 * 1. Reads agents from settings
 * 2. Resolves to AgentDescriptor[]
 *
 * Fails with CliError (code AGENTS_NOT_CONFIGURED) if no agents result.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ensureAgentsConfigured = (opts: EnsureAgentsOptions) =>
  Effect.gen(function* () {
    const log = yield* Log;
    const ws = yield* Workspace;

    let agents: AgentDescriptor[];

    if (opts.agentFlags.length > 0) {
      // Resolve from --agent flags
      const [invalidIds, validIds] = Array.partition(opts.agentFlags, (id) =>
        Option.isSome(getAgentById(id)),
      );

      if (invalidIds.length > 0) {
        yield* log.warn(`Unknown agents: ${invalidIds.join(", ")}`);
      }

      agents = pipe(
        validIds,
        Array.map((id) => getAgentById(id)),
        Array.getSomes,
      );

      // Check which agents are not yet in settings
      if (agents.length > 0) {
        const settingsAgents = yield* ws.getConfiguredAgents();
        const unconfigured = Array.filter(agents, (a) => !settingsAgents.includes(a.id));

        if (unconfigured.length > 0) {
          const names = Array.map(unconfigured, (a) => a.name).join(", ");
          let shouldAdd = false;

          if (opts.yes || opts.nonInteractive) {
            shouldAdd = true;
          } else if (isInteractive()) {
            const confirm = yield* Confirm;
            shouldAdd = yield* confirm.prompt({ message: `Add ${names} to workspace?` }).pipe(
              Effect.catchTag("PromptCancelled", () => Effect.succeed(false)),
              Effect.catchAll(() => Effect.succeed(false)),
            );
          }

          if (shouldAdd) {
            yield* Effect.forEach(unconfigured, (a) => ws.addConfiguredAgent(a.id)).pipe(
              Effect.catchAll(() => Effect.void),
            );
          }
        }
      }
    } else {
      // Resolve from settings
      const settingsAgents = yield* ws.getConfiguredAgents();
      agents = pipe(
        settingsAgents,
        Array.map((id) => getAgentById(id)),
        Array.getSomes,
      );
    }

    if (agents.length === 0) {
      return yield* Effect.fail(
        makeCliError({
          code: "AGENTS_NOT_CONFIGURED",
          what: "No agents configured",
          howToFix: "Run 'axm init' first or use --agent to specify agents",
        }),
      );
    }

    return agents;
  });

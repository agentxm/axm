/**
 * Agent detection functions for identifying installed AI coding agents.
 *
 * Detection is effectful and separated from the pure config registry.
 * Uses FileSystem service for testability.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as path from "node:path";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { home } from "./constants.js";
import { getAllAgents } from "./registry.js";
import type { AgentConfig } from "./types.js";

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

/**
 * Error thrown when agent detection fails.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class DetectionError extends Data.TaggedError("DetectionError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// -----------------------------------------------------------------------------
// Default Detection Heuristic
// -----------------------------------------------------------------------------

/**
 * Default heuristic detection for agents without specific detection logic.
 * Checks common patterns: ~/.{agent-id} or first segment of projectDir.
 */
const defaultDetect = (agent: AgentConfig) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    // Try common patterns for detection
    const patterns = [
      // ~/.{agent-id} pattern
      path.join(home, `.${agent.id}`),
      // Project-level directory pattern (first segment without leading dot)
      path.join(
        home,
        Option.getOrElse(
          Option.map(Array.head(agent.skills.projectDir.split("/")), (s) => s.replace(/^\./, "")),
          () => "",
        ),
      ),
    ];

    for (const pattern of patterns) {
      if (pattern && (yield* fs.exists(pattern))) {
        return true;
      }
    }
    return false;
  });

// -----------------------------------------------------------------------------
// Detection Functions
// -----------------------------------------------------------------------------

/**
 * Check if a specific agent is installed.
 *
 * Detection logic varies per agent based on their typical configuration directories.
 * Returns `true` if the agent appears to be installed, `false` otherwise.
 *
 * @param agent - The agent configuration to check
 * @returns Effect that resolves to boolean indicating installation status
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import { NodeFileSystem } from "@effect/platform-node";
 * import { detectAgent, AGENTS } from "@axm.sh/core/experimental/agents";
 *
 * const program = Effect.gen(function* () {
 *   const isInstalled = yield* detectAgent(AGENTS["claude-code"]);
 *   console.log(`Claude Code installed: ${isInstalled}`);
 * });
 *
 * Effect.runPromise(
 *   program.pipe(Effect.provide(NodeFileSystem.layer))
 * );
 * ```
 *
 * @experimental This API is unstable and may change without notice.
 */
export const detectAgent = (
  agent: AgentConfig,
): Effect.Effect<boolean, DetectionError, FileSystem.FileSystem> => {
  const detector = agent.detect ?? (() => defaultDetect(agent));
  return detector().pipe(
    Effect.mapError(
      (error) =>
        new DetectionError({
          message: `Failed to detect ${agent.name}`,
          cause: error,
        }),
    ),
  );
};

/**
 * Detect all installed agents concurrently.
 *
 * Checks all registered agents and returns configurations for those
 * that appear to be installed on the system.
 *
 * @returns Effect that resolves to array of installed agent configurations
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import { NodeFileSystem } from "@effect/platform-node";
 * import { detectAgents } from "@axm.sh/core/experimental/agents";
 *
 * const program = Effect.gen(function* () {
 *   const installed = yield* detectAgents();
 *   console.log(`Found ${installed.length} installed agents`);
 *   for (const agent of installed) {
 *     console.log(`- ${agent.name}`);
 *   }
 * });
 *
 * Effect.runPromise(
 *   program.pipe(Effect.provide(NodeFileSystem.layer))
 * );
 * ```
 *
 * @experimental This API is unstable and may change without notice.
 */
export const detectAgents = (): Effect.Effect<
  AgentConfig[],
  DetectionError,
  FileSystem.FileSystem
> =>
  Effect.filter(getAllAgents(), (agent) => detectAgent(agent), {
    concurrency: "unbounded",
  });

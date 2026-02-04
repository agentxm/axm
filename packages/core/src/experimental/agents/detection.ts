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
import { FileSystem } from "@effect/platform";
import { Data, Effect } from "effect";
import { claudeHome, codexHome, configHome, home } from "./constants.js";
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
 * import { detectAgent, AGENTS } from "@agentxm/core/experimental/agents";
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
): Effect.Effect<boolean, DetectionError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    switch (agent.id) {
      case "claude-code":
        return yield* fs.exists(claudeHome);

      case "cursor":
        return yield* fs.exists(path.join(home, ".cursor"));

      case "codex": {
        const [codexExists, etcExists] = yield* Effect.all([
          fs.exists(codexHome),
          fs.exists("/etc/codex"),
        ]);
        return codexExists || etcExists;
      }

      case "opencode":
        return yield* fs.exists(path.join(configHome, "opencode"));

      case "windsurf":
        return yield* fs.exists(path.join(home, ".codeium"));

      case "continue":
        return yield* fs.exists(path.join(home, ".continue"));

      // For other agents, check if their typical config directory exists
      // based on a heuristic: most agents use ~/.{agent-id} or projectDir pattern
      default: {
        // Try common patterns for detection
        const patterns = [
          // ~/.{agent-id} pattern
          path.join(home, `.${agent.id}`),
          // Project-level directory pattern (first segment without leading dot)
          path.join(home, agent.skills.projectDir.split("/")[0]?.replace(/^\./, "") ?? ""),
        ];

        for (const pattern of patterns) {
          if (pattern && (yield* fs.exists(pattern))) {
            return true;
          }
        }
        return false;
      }
    }
  }).pipe(
    Effect.mapError(
      (error) =>
        new DetectionError({
          message: `Failed to detect ${agent.name}`,
          cause: error,
        }),
    ),
  );

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
 * import { detectAgents } from "@agentxm/core/experimental/agents";
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
  Effect.gen(function* () {
    const agents = getAllAgents();
    const results = yield* Effect.all(
      agents.map((agent) =>
        detectAgent(agent).pipe(Effect.map((detected) => (detected ? agent : null))),
      ),
      { concurrency: "unbounded" },
    );
    return results.filter((a): a is AgentConfig => a !== null);
  });

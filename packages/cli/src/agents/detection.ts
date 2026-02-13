/**
 * Agent detection functions for identifying installed AI coding agents.
 *
 * Detection is effectful and separated from the pure descriptor registry.
 * Uses FileSystem service for testability.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as path from "node:path";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import { home } from "./constants.js";
import { getAllAgents } from "./registry.js";
import type { AgentDescriptor } from "./types.js";

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
 * Check if a specific agent is installed by checking both project-level
 * and global directories.
 *
 * - **Project-level**: Checks if the first path segment of `skills.dir`
 *   exists in `projectDir` (e.g., `.claude/` for Claude Code)
 * - **Global**: Checks if `~/.{agent-id}` exists in the user's home
 *
 * Returns `true` if either check passes (logical OR).
 *
 * @param agent - The agent descriptor to check
 * @param projectDir - The project directory to check for agent config
 * @returns Effect that resolves to boolean indicating detection status
 *
 * @experimental This API is unstable and may change without notice.
 */
export const detectAgent = (
  agent: AgentDescriptor,
  projectDir: string,
): Effect.Effect<boolean, DetectionError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    // Project-level: first segment of skills.dir in projectDir
    const firstSegment = agent.skills.dir.split("/")[0] ?? "";
    const projectPath = path.join(projectDir, firstSegment);

    // Global: ~/.{agent-id} in home directory
    const globalPath = path.join(home, `.${agent.id}`);

    const [projectExists, globalExists] = yield* Effect.all(
      [fs.exists(projectPath), fs.exists(globalPath)],
      { concurrency: "unbounded" },
    );

    return projectExists || globalExists;
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
 * Checks all registered agents and returns descriptors for those
 * that appear to be installed on the system.
 *
 * @param projectDir - The project directory to check for agent config
 * @returns Effect that resolves to array of detected agent descriptors
 *
 * @experimental This API is unstable and may change without notice.
 */
export const detectAgents = (
  projectDir: string,
): Effect.Effect<AgentDescriptor[], DetectionError, FileSystem.FileSystem> =>
  Effect.filter(getAllAgents(), (agent) => detectAgent(agent, projectDir), {
    concurrency: "unbounded",
  });

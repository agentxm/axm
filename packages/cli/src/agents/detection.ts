/**
 * Agent detection functions for identifying installed AI coding agents.
 *
 * Detection is effectful and separated from the pure descriptor registry.
 * Uses FileSystem service for testability.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import { type CliError, makeCliError } from "../cli-error/index.js";
import { getHome } from "./constants.js";
import { getAllAgents } from "./registry.js";
import type { AgentDescriptor } from "./types.js";

// -----------------------------------------------------------------------------
// Detection Functions
// -----------------------------------------------------------------------------

/**
 * Check if a specific agent is installed by checking both project-level
 * and user-scope directories.
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
): Effect.Effect<boolean, CliError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;

    const home = yield* getHome;

    // Project-level: first segment of skills.dir in projectDir
    const firstSegment = agent.skills.dir.split("/")[0] ?? "";
    const projectPath = p.join(projectDir, firstSegment);

    // Global: ~/.{agent-id} in home directory
    const globalPath = p.join(home, `.${agent.id}`);

    const [projectExists, globalExists] = yield* Effect.all(
      [fs.exists(projectPath), fs.exists(globalPath)],
      { concurrency: "unbounded" },
    );

    return projectExists || globalExists;
  }).pipe(
    Effect.mapError((error) =>
      makeCliError({
        code: "AGENT_DETECTION_FAILED",
        what: `Failed to detect ${agent.name}`,
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
): Effect.Effect<ReadonlyArray<AgentDescriptor>, CliError, FileSystem.FileSystem | Path.Path> =>
  Effect.filter(getAllAgents(), (agent) => detectAgent(agent, projectDir), {
    concurrency: "unbounded",
  });

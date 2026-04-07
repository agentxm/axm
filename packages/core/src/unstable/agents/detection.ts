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
import { makeAppError } from "../app-error/index.js";
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
export const detectAgent = (agent: AgentDescriptor, projectDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;

    const home = yield* getHome;

    // Project-level: first segment of skills.dir in projectDir
    const skillsFirstSegment = agent.skills.dir.split("/")[0] ?? "";
    const skillsProjectPath = p.join(projectDir, skillsFirstSegment);

    // Project-level: first segment of commands.dir in projectDir (if agent supports commands)
    const commandsFirstSegment = agent.commands?.dir.split("/")[0] ?? "";

    // Global: ~/.{agent-id} in home directory
    const globalPath = p.join(home, `.${agent.id}`);

    // Build list of paths to check concurrently
    const pathsToCheck = [
      fs.exists(skillsProjectPath),
      fs.exists(globalPath),
      // Only check commands dir if it differs from skills dir first segment
      ...(commandsFirstSegment !== "" && commandsFirstSegment !== skillsFirstSegment
        ? [fs.exists(p.join(projectDir, commandsFirstSegment))]
        : []),
    ];

    const results = yield* Effect.all(pathsToCheck, { concurrency: "unbounded" });

    return results.some((exists) => exists);
  }).pipe(
    Effect.mapError((error) =>
      makeAppError({
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
export const detectAgents = (projectDir: string) =>
  Effect.filter(getAllAgents(), (agent) => detectAgent(agent, projectDir), {
    concurrency: "unbounded",
  });

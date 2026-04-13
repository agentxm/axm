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

const wrapDetectionError = (what: string) => (error: unknown) =>
  makeAppError({
    code: "AGENT_DETECTION_FAILED",
    what,
    cause: error,
  });

const firstPathSegment = (dir: string): string | undefined => {
  const segment = dir.split("/")[0];
  return segment === undefined || segment.length === 0 ? undefined : segment;
};

const detectionSegments = (agent: AgentDescriptor): ReadonlyArray<string> =>
  Array.from(
    new Set(
      [
        firstPathSegment(agent.skills.dir),
        firstPathSegment(agent.commands?.dir ?? ""),
        firstPathSegment(agent.subagents?.dir ?? ""),
      ].filter((segment): segment is string => segment !== undefined),
    ),
  );

const detectAgentInRootRaw = (agent: AgentDescriptor, rootDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const results = yield* Effect.all(
      detectionSegments(agent).map((segment) => fs.exists(p.join(rootDir, segment))),
      { concurrency: "unbounded" },
    );

    return results.some((exists) => exists);
  });

/**
 * Check whether an agent can be detected from a single filesystem root.
 *
 * Uses the first segment of the agent's skills, commands, and subagents
 * descriptors.
 */
export const detectAgentInRoot = (agent: AgentDescriptor, rootDir: string) =>
  detectAgentInRootRaw(agent, rootDir).pipe(
    Effect.mapError(wrapDetectionError(`Failed to detect ${agent.name}`)),
  );

/**
 * Check if a specific agent is installed by checking both project-level and
 * user-scope roots, plus the legacy `~/.<agent-id>` fallback.
 *
 * Returns `true` if any supported location exists.
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

    const results = yield* Effect.all(
      [
        detectAgentInRootRaw(agent, projectDir),
        detectAgentInRootRaw(agent, home),
        fs.exists(p.join(home, `.${agent.id}`)),
      ],
      { concurrency: "unbounded" },
    );

    return results.some((exists) => exists);
  }).pipe(Effect.mapError(wrapDetectionError(`Failed to detect ${agent.name}`)));

/**
 * Detect all installed agents from a single filesystem root.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const detectAgentsInRoot = (rootDir: string) =>
  Effect.filter(getAllAgents(), (agent) => detectAgentInRootRaw(agent, rootDir), {
    concurrency: "unbounded",
  }).pipe(Effect.mapError(wrapDetectionError(`Failed to detect installed agents in ${rootDir}`)));

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

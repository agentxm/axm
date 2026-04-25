/**
 * Subagent file detection for agent directories.
 *
 * Scans agent subagent directories to find existing subagent files.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { makeAppError } from "../app-error/index.js";
import type { AgentDescriptor } from "./types.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * A detected subagent file.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface DetectedSubagentFile {
  /** File path relative to the project directory */
  readonly path: string;
}

/**
 * Summary of detected subagent files for an agent.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface AgentSubagentSummary {
  /** Agent identifier */
  readonly agentId: string;
  /** Agent display name */
  readonly agentName: string;
  /** Subagent directory path relative to project */
  readonly subagentDir: string;
  /** Detected subagent files */
  readonly files: ReadonlyArray<DetectedSubagentFile>;
}

// -----------------------------------------------------------------------------
// Detection
// -----------------------------------------------------------------------------

/**
 * Scan a single agent's subagent directory for existing files.
 *
 * Returns `Option.None`-style empty array when the directory does not exist.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const scanAgentSubagentFiles = (agent: AgentDescriptor, projectDir: string) =>
  Effect.gen(function* () {
    const subagents = agent.subagents;
    if (subagents === undefined) {
      return [];
    }

    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const subagentPath = p.resolve(projectDir, subagents.dir);

    const exists = yield* fs.exists(subagentPath);
    if (!exists) {
      return [];
    }

    if (subagents.isFile === true) {
      return [{ path: subagents.dir }] as const;
    }

    // Directory — list files and check each for marker
    const entries = yield* fs.readDirectory(subagentPath);
    const files = yield* Effect.filter(
      entries,
      (entry) =>
        Effect.gen(function* () {
          const stat = yield* fs.stat(p.join(subagentPath, entry));
          return stat.type === "File";
        }),
      { concurrency: "unbounded" },
    );

    return yield* Effect.forEach(
      files,
      (file) =>
        Effect.succeed({
          path: p.join(subagents.dir, file),
        } satisfies DetectedSubagentFile),
      { concurrency: "unbounded" },
    );
  }).pipe(
    Effect.mapError((error) =>
      makeAppError({
        code: "AGENT_DETECTION_FAILED",
        what: `Failed to scan subagent files for ${agent.name}`,
        cause: error,
      }),
    ),
  );

/**
 * Scan all configured agents' subagent directories for existing files.
 *
 * Returns a summary per agent that has a subagents descriptor, including
 * only agents where subagent files were found.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const scanAllSubagentFiles = (agents: ReadonlyArray<AgentDescriptor>, projectDir: string) =>
  Effect.gen(function* () {
    const agentsWithSubagents = agents.filter((a) => a.subagents !== undefined);

    const results = yield* Effect.forEach(
      agentsWithSubagents,
      (agent) =>
        Effect.gen(function* () {
          const files = yield* scanAgentSubagentFiles(agent, projectDir);
          return {
            agentId: agent.id,
            agentName: agent.name,
            subagentDir: agent.subagents?.dir ?? "",
            files,
          } satisfies AgentSubagentSummary;
        }),
      { concurrency: "unbounded" },
    );

    // Only include agents where files were found
    return results.filter((r) => r.files.length > 0);
  });

/**
 * WorkspaceReadModel discovery capability for agent subagent files.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { SubagentScanFailed } from "../errors.js";
import { AGENTS } from "@agentxm/extension-model/unstable/agents/registry";
import type { AgentDescriptor, AgentId } from "@agentxm/extension-model/unstable/agents/types";
import { SCANNER_IO_CONCURRENCY } from "../scanners/fs-helpers.js";

export interface DetectedSubagentFile {
  /** File path relative to the project directory */
  readonly path: string;
}

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

const isKnownAgentId = (id: string): id is AgentId => Object.hasOwn(AGENTS, id);

const scanKnownAgentSubagentFiles = (agent: AgentDescriptor, projectDir: string) =>
  Effect.gen(function* () {
    const subagents = agent.subagents;
    if (subagents === undefined) return [];

    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const subagentPath = p.resolve(projectDir, subagents.dir);

    const exists = yield* fs.exists(subagentPath);
    if (!exists) return [];

    if (subagents.isFile === true) {
      return [{ path: subagents.dir }] as const;
    }

    const entries = yield* fs.readDirectory(subagentPath);
    const files = yield* Effect.filter(
      entries,
      (entry) =>
        Effect.gen(function* () {
          const stat = yield* fs.stat(p.join(subagentPath, entry));
          return stat.type === "File";
        }),
      { concurrency: SCANNER_IO_CONCURRENCY },
    );

    return files.map(
      (file) => ({ path: p.join(subagents.dir, file) }) satisfies DetectedSubagentFile,
    );
  }).pipe(
    Effect.mapError((error) => new SubagentScanFailed({ agentName: agent.name, cause: error })),
  );

export const scanAgentSubagentFiles = (agentId: string, projectDir: string) =>
  isKnownAgentId(agentId)
    ? scanKnownAgentSubagentFiles(AGENTS[agentId], projectDir)
    : Effect.succeed<ReadonlyArray<DetectedSubagentFile>>([]);

export const scanAllSubagentFiles = (projectDir: string) =>
  Effect.gen(function* () {
    const agentsWithSubagents = Object.values(AGENTS).filter(
      (agent) => agent.subagents !== undefined,
    );

    const results = yield* Effect.forEach(
      agentsWithSubagents,
      (agent) =>
        Effect.gen(function* () {
          const files = yield* scanKnownAgentSubagentFiles(agent, projectDir);
          return {
            agentId: agent.id,
            agentName: agent.name,
            subagentDir: agent.subagents?.dir ?? "",
            files,
          } satisfies AgentSubagentSummary;
        }),
      { concurrency: SCANNER_IO_CONCURRENCY },
    );

    return results.filter((result) => result.files.length > 0);
  });

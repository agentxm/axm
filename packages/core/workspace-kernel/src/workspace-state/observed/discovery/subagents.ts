/**
 * WorkspaceReadModel discovery capability for agent subagent files.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { SubagentScanFailed } from "../errors.js";
import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";
import type { AgentDescriptor } from "@agentxm/extension-model/unstable/agents/types";
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

type SubagentLocationDeclaration = NonNullable<AgentDescriptor["subagents"]>["locations"][number];

const projectSubagentDeclaration = (agent: AgentDescriptor) =>
  agent.subagents?.locations.find(
    (location) =>
      location.scope === "project" &&
      location.role === "primary" &&
      location.applicability.kind === "always",
  );

/**
 * Observe one resolved subagent location. `Option.none()` means it is absent;
 * a present directory yields the names of its regular files, and a present
 * file-shaped location yields no names.
 */
const scanSubagentLocation = (
  fs: FileSystem.FileSystem,
  p: Path.Path,
  shape: SubagentLocationDeclaration["shape"],
  subagentPath: string,
) =>
  Effect.gen(function* () {
    const exists = yield* fs.exists(subagentPath);
    if (!exists) return Option.none<ReadonlyArray<string>>();

    if (shape === "file") return Option.some<ReadonlyArray<string>>([]);

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
    return Option.some<ReadonlyArray<string>>(files);
  });

/** A newly built file list for one agent's declaration. */
const detectedFiles = (
  p: Path.Path,
  declaration: SubagentLocationDeclaration,
  observed: Option.Option<ReadonlyArray<string>>,
): ReadonlyArray<DetectedSubagentFile> =>
  Option.match(observed, {
    onNone: () => [],
    onSome: (names) =>
      declaration.shape === "file"
        ? [{ path: declaration.path }]
        : names.map((name) => ({ path: p.join(declaration.path, name) })),
  });

const scanFailed = (agent: AgentDescriptor) => (error: unknown) =>
  new SubagentScanFailed({ agentName: agent.name, cause: error });

export const scanAllSubagentFiles = (projectDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const agentsWithSubagents = Object.values(AGENT_DESCRIPTORS).filter(
      (agent) => agent.subagents !== undefined,
    );

    const located = agentsWithSubagents.flatMap((agent) => {
      const declaration = projectSubagentDeclaration(agent);
      if (declaration === undefined) return [];
      const subagentPath = p.resolve(projectDir, declaration.path);
      return [{ agent, declaration, subagentPath, key: `${declaration.shape}:${subagentPath}` }];
    });

    // Agents that declare the same location share one scan in this call. The
    // first agent in registry order that declares a location owns its scan
    // and names its failure.
    const owners = located.filter(
      (subject, index) => located.findIndex(({ key }) => key === subject.key) === index,
    );
    const scans = yield* Effect.forEach(
      owners,
      (owner) =>
        scanSubagentLocation(fs, p, owner.declaration.shape, owner.subagentPath).pipe(
          Effect.mapError(scanFailed(owner.agent)),
        ),
      { concurrency: SCANNER_IO_CONCURRENCY },
    );

    const results = located.map(
      ({ agent, declaration, key }) =>
        ({
          agentId: agent.id,
          agentName: agent.name,
          subagentDir:
            agent.subagents?.locations.find(
              (location) => location.scope === "project" && location.role === "primary",
            )?.path ?? "",
          files: detectedFiles(
            p,
            declaration,
            scans[owners.findIndex((owner) => owner.key === key)] ?? Option.none(),
          ),
        }) satisfies AgentSubagentSummary,
    );

    return results.filter((result) => result.files.length > 0);
  });

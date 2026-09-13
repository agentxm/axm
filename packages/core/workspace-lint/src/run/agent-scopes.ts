/**
 * Agent facts that cross the selected scope's boundary.
 *
 * A coding agent reads the user scope and the project folder together, so a
 * lint run reports what the other side contributes to the same agent context:
 * the user scope's agent outputs and whether its workspace has readable
 * settings, and agent content in a project folder that has no workspace
 * settings to explain it.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { AGENTS } from "@agentxm/extension-model/unstable/agents/registry";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import {
  CodingAgentRepository,
  observeAgentOutputs,
  type AgentOutputObservation,
} from "@agentxm/workspace-projection";
import { resolveUserWorkspaceLayout } from "@agentxm/workspace-state";

import { loadSettingsDocument } from "./settings.js";

/** The user scope as a project-scope run's agents also see it. */
export interface UserScopeObservation {
  readonly home: string;
  readonly settingsPath: string;
  readonly settingsReadable: boolean;
  readonly outputs: ReadonlyArray<AgentOutputObservation>;
}

/** One agent-native file or directory in a project folder. */
export interface AgentContentEntry {
  readonly kind: "instructions" | AgentOutputObservation["extensionType"];
  readonly path: string;
  /** Entries inside a directory container; absent for a single file. */
  readonly entryCount?: number;
  readonly agentIds: ReadonlyArray<string>;
}

const NO_EXPECTED_NAMES = {
  skill: new Set<string>(),
  subagent: new Set<string>(),
  "mcp-server": new Set<string>(),
  hook: new Set<string>(),
};

/**
 * Observe the user scope's agent outputs under `userHome`.
 *
 * Containers resolve relative to `userHome` rather than the process home, so
 * the observation follows the home the run selected. Anything under the user
 * AXM home counts as AXM storage, including storage left by an earlier layout.
 */
export const observeUserScope = (
  userHome: string,
): Effect.Effect<
  UserScopeObservation,
  never,
  CodingAgentRepository | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const layout = yield* resolveUserWorkspaceLayout(decodeAbsolutePathSync(userHome));
    const settings = yield* loadSettingsDocument(userHome, "user");
    const inventory = yield* observeAgentOutputs({
      workspaceRoot: userHome,
      scope: "project",
      desiredAgentIds: new Set<string>(),
      expectedNames: NO_EXPECTED_NAMES,
      skillOwnershipRoots: [layout.axmHome],
      authoredSkills: { layout, entries: {} },
    });
    return {
      home: userHome,
      settingsPath: layout.settingsPath,
      settingsReadable: Option.isSome(settings),
      outputs: inventory.outputs,
    };
  });

const instructionPath = (descriptor: (typeof AGENTS)[keyof typeof AGENTS]): string | undefined => {
  const instructions = descriptor.instructions;
  if (instructions === undefined) return undefined;
  switch (instructions.kind) {
    case "agents-md":
      return "AGENTS.md";
    case "own-file":
      return instructions.file;
    case "rules-dir":
      return instructions.dir;
  }
};

/**
 * Observe agent instruction files and non-empty agent output containers in a
 * project folder, grouped by path with the agents that read each one.
 */
export const observeProjectAgentContent = (args: {
  readonly projectRoot: string;
  readonly outputs: ReadonlyArray<AgentOutputObservation>;
}): Effect.Effect<ReadonlyArray<AgentContentEntry>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const instructionAgents = new Map<string, Set<string>>();
    for (const descriptor of Object.values(AGENTS)) {
      const relative = instructionPath(descriptor);
      if (relative === undefined) continue;
      const agents = instructionAgents.get(relative) ?? new Set<string>();
      agents.add(descriptor.id);
      instructionAgents.set(relative, agents);
    }
    const instructions = yield* Effect.forEach(
      [...instructionAgents],
      ([relative, agents]) =>
        fs.exists(path.join(args.projectRoot, relative)).pipe(
          Effect.orElseSucceed(() => false),
          Effect.map((exists): ReadonlyArray<AgentContentEntry> =>
            exists
              ? [
                  {
                    kind: "instructions",
                    path: path.join(args.projectRoot, relative),
                    agentIds: [...agents].sort(),
                  },
                ]
              : [],
          ),
        ),
      { concurrency: 8 },
    );

    const containers = new Map<
      string,
      { kind: AgentOutputObservation["extensionType"]; count: number; agents: Set<string> }
    >();
    for (const output of args.outputs) {
      const container = containers.get(output.containerPath) ?? {
        kind: output.extensionType,
        count: 0,
        agents: new Set<string>(),
      };
      container.count += 1;
      for (const agentId of output.claimantAgentIds) container.agents.add(agentId);
      containers.set(output.containerPath, container);
    }

    return [
      ...instructions.flat(),
      ...[...containers].map(([containerPath, container]): AgentContentEntry => ({
        kind: container.kind,
        path: containerPath,
        entryCount: container.count,
        agentIds: [...container.agents].sort(),
      })),
    ].sort((left, right) => left.path.localeCompare(right.path));
  });

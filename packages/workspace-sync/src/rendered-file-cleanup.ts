/**
 * Destructive reconciliation of AXM-owned agent-native outputs. Read-only
 * ownership and claimant discovery lives in `@agentxm/extension-workspace`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import {
  CodingAgentRepository,
  observeAgentOutputs,
  pruneManagedHooksFromJson,
  pruneManagedMcpServersForAgent,
  safeReadFileString,
  type AgentOutputInventory,
  type AgentOutputObservation,
  type WorkspaceOwnershipIssue,
} from "@agentxm/extension-workspace";
import { AGENTS as CAPABILITY_AGENTS } from "@agentxm/extension-model/unstable/agent-capabilities";
import type { PerAgentType } from "@agentxm/extension-model/unstable/extensions/common";
import {
  WorkspaceMutations,
  protectWorkspacePath,
  recordFootprint,
} from "@agentxm/workspace-state";
import { WorkspaceSyncFailed, type WorkspaceSyncCleanupFailure } from "./errors.js";

export interface ReconcileAgentOutputsResult {
  readonly removedPaths: ReadonlyArray<string>;
  readonly preservedPaths: ReadonlyArray<string>;
}

export interface ReconcileAgentOutputsArgs {
  readonly desiredAgentIds: ReadonlySet<string>;
  readonly expectedNames: Readonly<Record<PerAgentType, ReadonlySet<string>>>;
  readonly dryRun?: boolean;
}

const inventory = (
  args: ReconcileAgentOutputsArgs,
): Effect.Effect<
  AgentOutputInventory,
  never,
  CodingAgentRepository | FileSystem.FileSystem | Path.Path | WorkspaceMutations
> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    return yield* observeAgentOutputs({
      workspaceRoot: ws.baseDir,
      scope: ws.scope,
      desiredAgentIds: args.desiredAgentIds,
      expectedNames: args.expectedNames,
      skillOwnershipRoots:
        ws.layout.scope === "project"
          ? [ws.layout.acquiredRoot, ws.layout.authoredRoot("skill")]
          : [ws.layout.acquiredRoot],
    });
  });

const cleanupFailure = (detail: string, cause: unknown) =>
  new WorkspaceSyncFailed({ category: "internal", detail, cause });

const removeOwnedFile = (
  fs: FileSystem.FileSystem,
  output: AgentOutputObservation,
): Effect.Effect<void, WorkspaceSyncCleanupFailure> =>
  protectWorkspacePath(output.path).pipe(
    Effect.andThen(fs.remove(output.path, { recursive: true })),
    Effect.andThen(recordFootprint({ path: output.path, change: "removed" })),
    Effect.mapError((error) =>
      cleanupFailure(`Failed to remove managed agent artifact: ${output.path}`, error),
    ),
  );

const uniqueContainers = (
  outputs: ReadonlyArray<AgentOutputObservation>,
): ReadonlyArray<AgentOutputObservation> =>
  outputs.filter(
    (output, index) =>
      outputs.findIndex(
        (candidate) =>
          candidate.extensionType === output.extensionType &&
          candidate.containerPath === output.containerPath,
      ) === index,
  );

const desiredNamesForContainer = (
  output: AgentOutputObservation,
  args: ReconcileAgentOutputsArgs,
): ReadonlySet<string> =>
  output.claimantAgentIds.some((agentId) => args.desiredAgentIds.has(agentId))
    ? args.expectedNames[output.extensionType]
    : new Set<string>();

const pruneMcpContainer = (
  output: AgentOutputObservation,
  args: ReconcileAgentOutputsArgs,
  workspaceRoot: string,
  scope: "project" | "user",
): Effect.Effect<void, WorkspaceSyncCleanupFailure, FileSystem.FileSystem | Path.Path> => {
  const claimant = output.claimantAgentIds[0];
  if (claimant === undefined) return Effect.void;
  return pruneManagedMcpServersForAgent(claimant, {
    workspaceRoot,
    scope,
    declaredServerNames: desiredNamesForContainer(output, args),
  }).pipe(
    Effect.mapError((error) =>
      cleanupFailure(`Failed to reconcile managed MCP entries in: ${output.containerPath}`, error),
    ),
    Effect.asVoid,
  );
};

const pruneHookContainer = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  output: AgentOutputObservation,
  args: ReconcileAgentOutputsArgs,
  workspaceRoot: string,
  scope: "project" | "user",
): Effect.Effect<void, WorkspaceSyncCleanupFailure> =>
  Effect.gen(function* () {
    const writer = CAPABILITY_AGENTS.flatMap((agent) => {
      if (!output.claimantAgentIds.includes(agent.id)) return [];
      const candidate = agent.capabilities.hook.axm.writer;
      if (candidate === null) return [];
      const ownsPath = candidate.configFiles.some(
        (file) =>
          file.scope === scope &&
          file.format === "json" &&
          path.resolve(workspaceRoot, file.path) === output.containerPath,
      );
      return ownsPath ? [candidate] : [];
    })[0];
    if (writer === undefined) return;
    const raw = yield* safeReadFileString(fs, output.containerPath);
    const next = yield* pruneManagedHooksFromJson(
      output.containerPath,
      writer.settingsKey,
      raw,
      desiredNamesForContainer(output, args),
    ).pipe(
      Effect.mapError((error) =>
        cleanupFailure(`Failed to reconcile managed hooks in: ${output.containerPath}`, error),
      ),
    );
    if (next === raw) return;
    yield* protectWorkspacePath(output.containerPath).pipe(
      Effect.andThen(fs.writeFileString(output.containerPath, next)),
      Effect.andThen(recordFootprint({ path: output.containerPath, change: "modified" })),
      Effect.mapError((error) =>
        cleanupFailure(`Failed to write reconciled hooks to: ${output.containerPath}`, error),
      ),
    );
  });

/** Converge all AXM-owned per-agent outputs on desired workspace state. */
export const reconcileAgentOutputs = (
  args: ReconcileAgentOutputsArgs,
): Effect.Effect<
  ReconcileAgentOutputsResult,
  WorkspaceSyncCleanupFailure,
  CodingAgentRepository | FileSystem.FileSystem | Path.Path | WorkspaceMutations
> =>
  Effect.gen(function* () {
    const before = yield* inventory(args);
    const candidates = before.ownedResidue;
    const preservedPaths = [...new Set(before.unownedFootprints.map(({ path }) => path))].sort();
    if (args.dryRun === true) {
      return {
        removedPaths: [...new Set(candidates.map(({ path }) => path))].sort(),
        preservedPaths,
      };
    }

    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    for (const output of candidates) {
      if (output.extensionType === "skill" || output.extensionType === "subagent") {
        yield* removeOwnedFile(fs, output);
      }
    }
    for (const output of uniqueContainers(
      candidates.filter(({ extensionType }) => extensionType === "mcp-server"),
    )) {
      yield* pruneMcpContainer(output, args, ws.baseDir, ws.scope);
    }
    for (const output of uniqueContainers(
      candidates.filter(({ extensionType }) => extensionType === "hook"),
    )) {
      yield* pruneHookContainer(fs, path, output, args, ws.baseDir, ws.scope);
    }

    const after = yield* inventory(args);
    const remaining = new Set(
      after.outputs.map(
        (output) => `${output.extensionType}\u0000${output.path}\u0000${output.entryName}`,
      ),
    );
    const removedPaths = candidates
      .filter(
        (output) =>
          !remaining.has(`${output.extensionType}\u0000${output.path}\u0000${output.entryName}`),
      )
      .map(({ path: outputPath }) => outputPath);
    return { removedPaths: [...new Set(removedPaths)].sort(), preservedPaths };
  });

/** Inspect ownership proofs without mutating any agent-native artifact. */
export const inspectWorkspaceOwnership = (): Effect.Effect<
  ReadonlyArray<WorkspaceOwnershipIssue>,
  WorkspaceSyncCleanupFailure,
  CodingAgentRepository | FileSystem.FileSystem | Path.Path | WorkspaceMutations
> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const configured = new Set(yield* ws.getConfiguredAgents());
    const empty = new Set<string>();
    const observed = yield* inventory({
      desiredAgentIds: configured,
      expectedNames: {
        skill: empty,
        subagent: empty,
        "mcp-server": empty,
        hook: empty,
      },
    });
    return observed.unownedFootprints.map((output) => ({
      kind:
        output.extensionType === "hook"
          ? ("hook-ownership-ambiguous" as const)
          : ("managed-file-unowned" as const),
      path: output.path,
      detail:
        output.extensionType === "hook"
          ? `Hook command targets an AXM canonical extension path without x-axm ownership metadata: ${output.entryName}`
          : `Agent ${output.extensionType} artifact has no AXM ownership proof.`,
    }));
  });

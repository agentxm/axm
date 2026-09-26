/**
 * Adopting the MCP servers a workspace already had.
 *
 * People arrive with MCP servers configured directly in their coding agents.
 * Import records each one the workspace can represent losslessly as an inline
 * settings entry and marks the native entry as AXM-managed, so the next
 * reconciliation recognises it instead of treating it as someone else's file.
 * A server whose definitions disagree across agents is a conflict, not a
 * choice AXM makes on the person's behalf.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { NativeWriteAuthority } from "../../projection/agent-adapters/index.js";

import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  OperationJournal,
  ResolvePlanInteraction,
  operationPresentation,
  prepareExecutionCandidate,
  resolveExecutionCandidate,
  type JobStepArtifact,
  type JobStepResult,
  type OperationResolution,
  type Plan,
  type PlanExecution,
  type PlannedJobStep,
} from "../../transitions/planning/index.js";
import {
  ConfiguredAgentOutcomesProvider,
  LockfileReader,
  SettingsReader,
  SettingsWriter,
  WorkspaceLocation,
  WorkspaceRecords,
  settingsDisplayPath,
} from "../../desired-state/index.js";
import {
  FootprintRecorder,
  WorkspaceTransactionScope,
} from "../../transitions/settlement/index.js";

import {
  WorkspaceConfigurationFailed,
  configurationFailedToStepFailure,
  workspaceChangeFailedToStepFailure,
  type WorkspaceConfigurationExecutionFailure,
} from "../errors.js";
import { applyMcpImport, collectMcpImportSources } from "./apply.js";
import { preflightMcpImports, type McpImportPreflight } from "./preflight.js";

const plural = (count: number, singular: string): string =>
  `${String(count)} ${singular}${count === 1 ? "" : "s"}`;

export interface ImportMcpServersCandidate {
  readonly _tag: "ImportMcpServers";
  /** Every unmanaged server the workspace found, classified. */
  readonly preflight: McpImportPreflight;
  readonly scope: WorkspaceScope;
}

/**
 * Discover and classify every unmanaged MCP server the configured agents and
 * the workspace itself declare. Nothing is written; the candidate names the
 * servers that can be adopted, the ones that conflict, and the ones skipped.
 */
export const prepareImportMcpServers = (): Effect.Effect<
  ImportMcpServersCandidate,
  WorkspaceConfigurationFailed | Effect.Error<ReturnType<typeof collectMcpImportSources>>,
  SettingsReader | WorkspaceLocation | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const settings = yield* SettingsReader;
    const location = yield* WorkspaceLocation;
    const now = yield* DateTime.now;
    const configured = yield* settings.entries("mcp-server");
    const discovery = yield* collectMcpImportSources(location, settings);
    const normalized = preflightMcpImports({
      configuredNames: new Set(Object.keys(configured)),
      now,
      sources: discovery.sources,
    });
    return {
      _tag: "ImportMcpServers",
      preflight: {
        ...normalized,
        skipped: [...normalized.skipped, ...discovery.skipped].sort(
          (left, right) =>
            left.name.localeCompare(right.name) || left.reason.localeCompare(right.reason),
        ),
      },
      scope: location.scope,
    } satisfies ImportMcpServersCandidate;
  });

const importArtifact = (
  candidate: ImportMcpServersCandidate,
  baseDir: string,
  path: Path.Path,
): JobStepArtifact => {
  const adoptions = candidate.preflight.candidates.flatMap((entry) => entry.adoptions);
  const files = [...new Set(adoptions.map((adoption) => adoption.filePath))].sort();
  return {
    path: settingsDisplayPath(candidate.scope),
    scope: candidate.scope,
    change: "updated",
    fileCount: 1 + files.length,
    targets: [
      { path: settingsDisplayPath(candidate.scope), change: "updated" },
      ...files.map((filePath) => ({
        path: path.relative(baseDir, filePath),
        change: "updated" as const,
      })),
    ],
  };
};

/** Every service an inline import and its plan resolution need. */
export type ImportMcpServersRequirements =
  | ConfiguredAgentOutcomesProvider
  | FileSystem.FileSystem
  | NativeWriteAuthority
  | FootprintRecorder
  | OperationJournal
  | Path.Path
  | ResolvePlanInteraction
  | LockfileReader
  | SettingsReader
  | WorkspaceLocation
  | SettingsWriter
  | WorkspaceRecords
  | WorkspaceTransactionScope;

/**
 * Preview or apply the inline adoption. Every adopted entry is recorded and
 * every native entry marked in one transaction, and the transaction validates
 * the readback before it settles: a half-adopted server would look managed
 * without being managed.
 */
export const previewOrApplyImportMcpServers = (
  candidate: ImportMcpServersCandidate,
  execution: PlanExecution,
): Effect.Effect<
  OperationResolution<void>,
  WorkspaceConfigurationExecutionFailure,
  ImportMcpServersRequirements
> =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const path = yield* Path.Path;
    const artifact = importArtifact(candidate, location.baseDir, path);
    const conflictSteps = candidate.preflight.conflicts.map(
      (conflict): PlannedJobStep<ImportMcpServersRequirements> => ({
        label: conflict.name,
        readiness: "error",
        errorMessage: conflict.reason,
      }),
    );
    const importSteps: ReadonlyArray<PlannedJobStep<ImportMcpServersRequirements>> =
      candidate.preflight.candidates.length === 0
        ? []
        : [
            {
              label: `Import ${plural(candidate.preflight.candidates.length, "MCP server")}`,
              readiness: "ready",
              message: `Candidates: ${candidate.preflight.candidates.map((entry) => entry.name).join(", ")}`,
              artifact,
              run: applyMcpImport(candidate.preflight.candidates).pipe(
                Effect.mapError((failure) =>
                  failure instanceof WorkspaceConfigurationFailed
                    ? configurationFailedToStepFailure(failure)
                    : workspaceChangeFailedToStepFailure(failure),
                ),
                Effect.as({
                  result: "success",
                  message: `Imported ${plural(candidate.preflight.candidates.length, "MCP server")}`,
                  artifact,
                } satisfies JobStepResult),
              ),
            },
          ];
    const plan: Plan<ImportMcpServersRequirements> = {
      _tag: "Plan",
      name: "Import MCP servers",
      description: Option.some(
        `Adopt ${plural(candidate.preflight.candidates.length, "unmanaged MCP server")}`,
      ),
      presentation: operationPresentation(
        { imperative: "import", past: "Imported", gerund: "Importing" },
        "mcp-server",
      ),
      jobs: [{ concurrency: 1, steps: [...conflictSteps, ...importSteps] }],
    };
    const prepared = yield* prepareExecutionCandidate(plan);
    return yield* resolveExecutionCandidate(prepared, execution);
  });

/** The inline MCP import use case. */
export const ImportMcpServers = {
  prepare: prepareImportMcpServers,
  previewOrApply: previewOrApplyImportMcpServers,
} as const;

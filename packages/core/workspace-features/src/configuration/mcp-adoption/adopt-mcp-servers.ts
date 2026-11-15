import type { PlanSources } from "@agentxm/workspace-kernel/planning";
/**
 * Adopting the MCP servers a workspace already had.
 *
 * People arrive with MCP servers configured directly in their coding agents.
 * Adoption records each one the workspace can represent losslessly as an inline
 * settings entry and marks the native entry as AXM-managed, so the next
 * reconciliation recognises it instead of treating it as someone else's file.
 * A server whose definitions disagree across agents is a conflict, not a
 * choice AXM makes on the person's behalf.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { NativeWriteAuthority } from "@agentxm/workspace-kernel/agent-adapters";
import { type NativeLocationOutcome } from "@agentxm/workspace-kernel/locations";

import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  OperationJournal,
  ResolvePlanInteraction,
  operationPresentation,
  type JobStepArtifact,
  type JobStepResult,
  type OperationResolution,
  type Plan,
  type PlanExecution,
  type PlannedJobStep,
  type OperationRefused,
} from "@agentxm/workspace-kernel/operations";
import {
  prepareExecutionCandidate,
  resolveExecutionCandidate,
  type PlanResolutionFailure,
} from "@agentxm/workspace-kernel/planning";
import {
  withWorkspaceReadView,
  type WorkspaceStateReadFailure,
  ConfiguredAgentOutcomesProvider,
  LockfileReader,
  SettingsReader,
  DesiredStateReader,
  SettingsWriter,
  WorkspaceLocation,
  WorkspaceRecords,
  settingsDisplayPath,
} from "@agentxm/workspace-kernel/workspace-state";
import { FootprintRecorder, WorkspaceTransactionScope } from "@agentxm/workspace-kernel/settlement";

import { workspaceChangeFailedToStepFailure } from "../errors.js";
import {
  applyMcpAdoption,
  collectMcpNativeSources,
  prepareMcpAdoptionTargets,
  validateMcpAdoptionTargets,
} from "./apply.js";
import { preflightMcpAdoptions, type McpAdoptionPreflight } from "./preflight.js";

const plural = (count: number, singular: string): string =>
  `${String(count)} ${singular}${count === 1 ? "" : "s"}`;

/** @public Inferred types in this package name it in emitted declarations. */
export interface AdoptMcpServersCandidate {
  readonly _tag: "AdoptMcpServers";
  /** Every unmanaged server the workspace found, classified. */
  readonly preflight: McpAdoptionPreflight;
  readonly scope: WorkspaceScope;
  readonly nativeLocations: ReadonlyArray<NativeLocationOutcome>;
}

/**
 * Read the configured agents' native MCP sources and classify the selected
 * servers. The caller runs it inside its own workspace read view.
 */
const classifyNativeMcpServers = (names: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const settings = yield* SettingsReader;
    const location = yield* WorkspaceLocation;
    const now = yield* DateTime.now;
    const configured = yield* settings.entries("mcp-server");
    const discovery = yield* collectMcpNativeSources(location, settings);
    const normalized = preflightMcpAdoptions({
      configuredNames: new Set(Object.keys(configured)),
      now,
      sources: discovery.sources.map((source) => ({
        ...source,
        servers:
          names.length === 0
            ? source.servers
            : Object.fromEntries(
                Object.entries(source.servers).filter(([name]) => names.includes(name)),
              ),
      })),
    });
    const missing = names.filter(
      (name) => !discovery.sources.some((source) => Object.hasOwn(source.servers, name)),
    );
    const preflight: McpAdoptionPreflight = {
      ...normalized,
      conflicts: [
        ...normalized.conflicts,
        ...discovery.skipped.filter(
          (finding) => names.length === 0 || names.includes(finding.name),
        ),
        ...missing.map((name) => ({
          name,
          reason: "Requested native MCP name was not discovered",
        })),
      ],
    };
    return { location, candidates: normalized.candidates, preflight };
  });

/**
 * Discover and classify every unmanaged MCP server the configured agents and
 * the workspace itself declare. Nothing is written; the candidate names the
 * servers that can be adopted, the ones that conflict, and the ones skipped.
 */
const prepareAdoptMcpServers = (
  names: ReadonlyArray<string> = [],
): Effect.Effect<
  AdoptMcpServersCandidate,
  | OperationRefused
  | WorkspaceStateReadFailure
  | Effect.Error<ReturnType<typeof collectMcpNativeSources>>,
  SettingsReader | WorkspaceLocation | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const { location, candidates, preflight } = yield* classifyNativeMcpServers(names);
    return {
      _tag: "AdoptMcpServers",
      preflight,
      scope: location.scope,
      nativeLocations:
        preflight.conflicts.length > 0
          ? []
          : // Discovery read and fingerprinted every source in this read view.
            yield* prepareMcpAdoptionTargets(candidates, "discovered-in-this-read-phase"),
    } satisfies AdoptMcpServersCandidate;
  }).pipe(withWorkspaceReadView);

/** @public Inferred types in this package name it in emitted declarations. */
export interface McpAdoptionDiscovery {
  readonly _tag: "McpAdoptionDiscovery";
  /** Every unmanaged server the workspace found among the selected names, classified. */
  readonly preflight: McpAdoptionPreflight;
}

/**
 * Discover and classify the selected unmanaged MCP servers, and check that
 * every configured reader accepts each one as an inline entry, as adoption
 * preparation does. The result carries no adoption targets, so it can inform
 * a conversion but never an adoption.
 */
const discoverAdoptMcpServers = (names: ReadonlyArray<string> = []) =>
  Effect.gen(function* () {
    const { candidates, preflight } = yield* classifyNativeMcpServers(names);
    if (preflight.conflicts.length === 0) yield* validateMcpAdoptionTargets(candidates);
    return { _tag: "McpAdoptionDiscovery", preflight } satisfies McpAdoptionDiscovery;
  }).pipe(withWorkspaceReadView);

const importArtifact = (
  candidate: AdoptMcpServersCandidate,
  baseDir: string,
  path: Path.Path,
): JobStepArtifact => {
  const adoptions = candidate.preflight.candidates.flatMap((entry) => entry.adoptions);
  const files = [
    ...new Set([
      ...adoptions.map((adoption) => adoption.filePath),
      ...candidate.nativeLocations.map((location) => location.address.path),
    ]),
  ].sort();
  return {
    path: settingsDisplayPath(candidate.scope),
    scope: candidate.scope,
    change: "updated",
    nativeLocations: candidate.nativeLocations,
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

/** Every service an inline adoption and its plan resolution need. */
type AdoptMcpServersRequirements =
  | DesiredStateReader
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
const previewOrApplyAdoptMcpServers = (
  candidate: AdoptMcpServersCandidate,
  execution: PlanExecution,
): Effect.Effect<
  OperationResolution<void>,
  PlanResolutionFailure,
  AdoptMcpServersRequirements | PlanSources
> =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const path = yield* Path.Path;
    const artifact = importArtifact(candidate, location.baseDir, path);
    const conflictSteps = candidate.preflight.conflicts.map(
      (conflict): PlannedJobStep<AdoptMcpServersRequirements> => ({
        label: conflict.name,
        readiness: "error",
        errorMessage: conflict.reason,
      }),
    );
    const importSteps: ReadonlyArray<PlannedJobStep<AdoptMcpServersRequirements>> =
      candidate.preflight.candidates.length === 0 || candidate.preflight.conflicts.length > 0
        ? []
        : [
            {
              label: `Adopt ${plural(candidate.preflight.candidates.length, "MCP server")}`,
              readiness: "ready",
              message: `Candidates: ${candidate.preflight.candidates.map((entry) => entry.name).join(", ")}`,
              artifact,
              run: applyMcpAdoption(candidate.preflight.candidates).pipe(
                Effect.mapError(workspaceChangeFailedToStepFailure),
                Effect.map(
                  (nativeLocations) =>
                    ({
                      result: "success",
                      message: `Adopted ${plural(candidate.preflight.candidates.length, "MCP server")}`,
                      artifact: { ...artifact, nativeLocations },
                    }) satisfies JobStepResult,
                ),
              ),
            },
          ];
    const plan: Plan<AdoptMcpServersRequirements> = {
      _tag: "Plan",
      name: "Adopt MCP servers",
      description: Option.some(
        `Adopt ${plural(candidate.preflight.candidates.length, "unmanaged MCP server")}`,
      ),
      presentation: operationPresentation(
        { imperative: "adopt", past: "Adopted", gerund: "Adopting" },
        "mcp-server",
      ),
      jobs: [{ concurrency: 1, steps: [...conflictSteps, ...importSteps] }],
    };
    const prepared = yield* prepareExecutionCandidate(plan);
    return yield* resolveExecutionCandidate(prepared, execution, {
      additionalFreshness: () =>
        prepareMcpAdoptionTargets(candidate.preflight.candidates).pipe(
          Effect.map((locations) => Equal.equals(locations, candidate.nativeLocations)),
          Effect.orElseSucceed(() => false),
        ),
    });
  });

/** The inline MCP adoption use case. */
export const AdoptMcpServers = {
  prepare: prepareAdoptMcpServers,
  discover: discoverAdoptMcpServers,
  previewOrApply: previewOrApplyAdoptMcpServers,
} as const;

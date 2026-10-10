/**
 * Inline MCP servers: an MCP server this workspace defines in its own
 * settings rather than acquiring as a package.
 *
 * An inline entry is authored, not resolved: the workspace is the authority
 * for what it says, so adding one records the definition and projects it to
 * every configured agent, and never records an accepted resolution. Repeating
 * an add that already matches the recorded entry changes nothing.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { combineNativeLocationOutcomes } from "@agentxm/workspace-kernel/locations";

import {
  NativeWriteAuthority,
  syncInlineMcpServerToAgents,
  validateInlineMcpServerTargets,
  type McpServerSyncTarget,
} from "@agentxm/workspace-kernel/agent-adapters";
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
  type ReadyJobStep,
} from "@agentxm/workspace-kernel/operations";
import {
  prepareExecutionCandidate,
  resolveExecutionCandidate,
} from "@agentxm/workspace-kernel/planning";
import {
  ConfiguredAgentOutcomesProvider,
  LockfileReader,
  SettingsReader,
  SettingsWriter,
  WorkspaceLocation,
  WorkspaceRecords,
  settingsDisplayPath,
  type WorkspaceStateReadFailure,
} from "@agentxm/workspace-kernel/workspace-state";
import { FootprintRecorder, WorkspaceTransactionScope } from "@agentxm/workspace-kernel/settlement";

import {
  WorkspaceConfigurationFailed,
  workspaceChangeFailedToStepFailure,
  type WorkspaceConfigurationExecutionFailure,
} from "../errors.js";
import { kernelFailureToStepFailure } from "@agentxm/workspace-kernel/reconciliation";
import type { McpConnection, McpAuth } from "@agentxm/workspace-kernel/agent-adapters";
import {
  makeInlineMcpDefinition,
  matchesInlineMcpEntry,
  parseInlineMcpEnv,
  parseInlineMcpHeaders,
} from "./definition.js";

const plural = (count: number, singular: string): string =>
  `${String(count)} ${singular}${count === 1 ? "" : "s"}`;

export interface AddInlineMcpServerRequest {
  readonly name: string;
  readonly connection?: unknown;
  readonly transport?: McpConnection["transport"];
  readonly args?: ReadonlyArray<string>;
  readonly cwd?: string;
  readonly headerEnv?: ReadonlyArray<string>;
  readonly auth?: McpAuth;
  /** One literal executable token. Arguments are separate. */
  readonly command?: string;
  /** Inline remote streamable-HTTP URL. */
  readonly url?: string;
  /** `NAME` or `NAME=VALUE` inputs; a bare name becomes an environment reference. */
  readonly env: ReadonlyArray<string>;
  /** `Name:Value` headers for a remote server. */
  readonly headers: ReadonlyArray<string>;
}

export interface AddInlineMcpServerCandidate {
  readonly _tag: "AddInlineMcpServer";
  readonly name: string;
  readonly definition: McpConnection;
  readonly auth?: McpAuth;
  /** Whether the settings file already carries an entry under this name. */
  readonly replacesExistingEntry: boolean;
  readonly scope: WorkspaceScope;
}

/** The recorded entry already says exactly what the request asked for. */
export interface InlineMcpServerUnchanged {
  readonly _tag: "Unchanged";
  readonly name: string;
  readonly message: string;
}

/**
 * Settle an inline add: exactly one transport, validated inputs, and a
 * definition the workspace can record. A request whose recorded entry already
 * matches is reported as unchanged.
 */
export const prepareAddInlineMcpServer = (
  request: AddInlineMcpServerRequest,
): Effect.Effect<
  AddInlineMcpServerCandidate | InlineMcpServerUnchanged,
  WorkspaceConfigurationFailed | WorkspaceStateReadFailure,
  SettingsReader | WorkspaceLocation
> =>
  Effect.gen(function* () {
    if (
      request.connection === undefined &&
      request.command === undefined &&
      request.url === undefined
    ) {
      return yield* new WorkspaceConfigurationFailed({
        category: "usage",
        detail: `mcps add only configures inline MCP servers. Use axm mcps install ${request.name} for package or source locators.`,
        suggestions: [
          {
            description: "Install the MCP server package",
            cmd: `axm mcps install ${request.name}`,
          },
        ],
      });
    }
    if (
      [request.command, request.url, request.connection].filter((value) => value !== undefined)
        .length !== 1
    ) {
      return yield* new WorkspaceConfigurationFailed({
        category: "usage",
        detail: "Use exactly one of --command or --url.",
      });
    }

    const settings = yield* SettingsReader;
    const location = yield* WorkspaceLocation;
    const env = yield* parseInlineMcpEnv(request.env);
    const headers = yield* parseInlineMcpHeaders(request.headers, request.headerEnv);
    const definition = yield* makeInlineMcpDefinition(request, headers, env);
    const configured = yield* settings.entries("mcp-server");
    const existing = configured[request.name];
    if (
      matchesInlineMcpEntry({
        existing,
        definition,
        ...(request.auth === undefined ? {} : { auth: request.auth }),
      })
    ) {
      return {
        _tag: "Unchanged",
        name: request.name,
        message: `MCP server ${request.name} is already configured`,
      } satisfies InlineMcpServerUnchanged;
    }

    return {
      _tag: "AddInlineMcpServer",
      name: request.name,
      definition,
      ...(request.auth === undefined ? {} : { auth: request.auth }),
      replacesExistingEntry: existing !== undefined,
      scope: location.scope,
    } satisfies AddInlineMcpServerCandidate;
  });

const configArtifact = (
  scope: WorkspaceScope,
  change: JobStepArtifact["change"],
): JobStepArtifact => ({
  path: settingsDisplayPath(scope),
  scope,
  change,
  targets: [{ path: settingsDisplayPath(scope), change }],
});

const recordStep = (candidate: AddInlineMcpServerCandidate): ReadyJobStep<SettingsWriter> => ({
  label: `Configure ${candidate.name}`,
  readiness: "ready",
  run: Effect.gen(function* () {
    const settings = yield* SettingsWriter;
    yield* settings
      .setEntry("mcp-server", candidate.name, {
        kind: "inline",
        connection: candidate.definition,
        ...(candidate.auth === undefined ? {} : { auth: candidate.auth }),
        enabled: true,
      })
      .pipe(Effect.mapError(workspaceChangeFailedToStepFailure));
    return {
      result: "success",
      message: `Configured ${candidate.name}`,
      artifact: configArtifact(
        candidate.scope,
        candidate.replacesExistingEntry ? "updated" : "created",
      ),
    } satisfies JobStepResult;
  }),
});

/**
 * Project the recorded entry into every configured agent's native MCP
 * configuration. A refused native write fails the same closure as the settings change.
 */
const projectStep = (
  candidate: AddInlineMcpServerCandidate,
): ReadyJobStep<
  NativeWriteAuthority | SettingsReader | WorkspaceLocation | FileSystem.FileSystem | Path.Path
> => ({
  label: `Sync ${candidate.name} to configured agents`,
  readiness: "ready",
  run: Effect.gen(function* () {
    const settings = yield* SettingsReader;
    const location = yield* WorkspaceLocation;
    const entries = yield* settings
      .entries("mcp-server")
      .pipe(Effect.mapError(workspaceChangeFailedToStepFailure));
    const entry = entries[candidate.name];
    if (entry === undefined) {
      return {
        result: "success",
        message: `${candidate.name} is not configured`,
      } satisfies JobStepResult;
    }
    const agentIds = yield* settings.configuredAgents.pipe(
      Effect.mapError(workspaceChangeFailedToStepFailure),
    );
    const outcomes = yield* syncInlineMcpServerToAgents(agentIds, {
      nativeDirectoryInputs: location.nativeDirectoryInputs,
      workspaceRoot: location.baseDir,
      serverName: candidate.name,

      entry,
      scope: location.scope,
    }).pipe(Effect.mapError(kernelFailureToStepFailure));
    const warningDetails = outcomes.flatMap((outcome, index) => {
      const agentId = agentIds[index] ?? "unknown";
      return outcome._tag === "success"
        ? (outcome.warnings ?? []).map((warning) => `${agentId}: ${warning}`)
        : [`${agentId}: ${outcome.reason}`];
    });
    const successfulAgentIds = outcomes.flatMap((outcome, index) => {
      const agentId = agentIds[index];
      return outcome._tag === "success" && agentId !== undefined ? [agentId] : [];
    });
    const groupedTargets = new Map<
      string,
      {
        readonly path: string;
        change: McpServerSyncTarget["change"];
        agentIds: Array<string>;
      }
    >();
    outcomes.forEach((outcome, index) => {
      const agentId = agentIds[index];
      if (outcome._tag !== "success" || agentId === undefined) return;
      (outcome.targets ?? []).forEach((target) => {
        const grouped = groupedTargets.get(target.path);
        if (grouped === undefined) {
          groupedTargets.set(target.path, {
            path: target.path,
            change: target.change,
            agentIds: [agentId],
          });
          return;
        }
        grouped.agentIds.push(agentId);
        if (grouped.change !== "created" && target.change === "created") {
          grouped.change = "created";
        }
      });
    });
    const syncTargets = [...groupedTargets.values()].map((target) => ({
      path: target.path,
      change: target.change,
      agentIds: target.agentIds,
    }));
    const artifact =
      successfulAgentIds.length === 0
        ? undefined
        : ({
            path:
              syncTargets.length === 1
                ? (syncTargets[0]?.path ?? ".mcp.json")
                : "agent MCP configs",
            scope: candidate.scope,
            agents: successfulAgentIds,
            change: syncTargets.some((target) => target.change === "created")
              ? "created"
              : "updated",
            fileCount: syncTargets.length,
            targets: syncTargets,
            nativeLocations: combineNativeLocationOutcomes(
              outcomes.flatMap((outcome) =>
                outcome._tag === "success"
                  ? (outcome.targets ?? []).flatMap((target) =>
                      target.nativeLocation === undefined ? [] : [target.nativeLocation],
                    )
                  : [],
              ),
            ),
          } satisfies JobStepArtifact);
    return {
      result: "success",
      message:
        warningDetails.length === 0
          ? `Synced ${candidate.name} to ${plural(successfulAgentIds.length, "agent")}`
          : `Synced ${candidate.name} to ${plural(successfulAgentIds.length, "agent")} with ${plural(warningDetails.length, "warning")}`,
      ...(warningDetails.length > 0 ? { warnings: warningDetails } : {}),
      ...(artifact === undefined ? {} : { artifact }),
    } satisfies JobStepResult;
  }),
});

/** Every service an inline MCP change and its plan resolution need. */
export type AddInlineMcpServerRequirements =
  | ConfiguredAgentOutcomesProvider
  | FileSystem.FileSystem
  | FootprintRecorder
  | NativeWriteAuthority
  | OperationJournal
  | Path.Path
  | ResolvePlanInteraction
  | LockfileReader
  | SettingsReader
  | WorkspaceLocation
  | SettingsWriter
  | WorkspaceRecords
  | WorkspaceTransactionScope;

/** Preview or apply a settled inline add: record the entry, then project it. */
export const previewOrApplyAddInlineMcpServer = (
  candidate: AddInlineMcpServerCandidate,
  execution: PlanExecution,
): Effect.Effect<
  OperationResolution<void>,
  WorkspaceConfigurationExecutionFailure,
  AddInlineMcpServerRequirements
> =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const agentIds = yield* settings.configuredAgents;
    const nativeArgs = {
      nativeDirectoryInputs: location.nativeDirectoryInputs,
      nativeInsertionEligible: !candidate.replacesExistingEntry,
      workspaceRoot: location.baseDir,
      serverName: candidate.name,
      scope: location.scope,
      entry: {
        kind: "inline" as const,
        connection: candidate.definition,
        ...(candidate.auth === undefined ? {} : { auth: candidate.auth }),
        enabled: true,
      },
    };
    const inspect = validateInlineMcpServerTargets(agentIds, nativeArgs);
    const preflight = yield* Effect.result(inspect);
    const steps: ReadonlyArray<PlannedJobStep<AddInlineMcpServerRequirements>> =
      preflight._tag === "Failure"
        ? [
            {
              readiness: "error",
              label: `Configure ${candidate.name}`,
              errorMessage: kernelFailureToStepFailure(preflight.failure).detail,
            },
          ]
        : [
            {
              readiness: "ready",
              label: `Configure and project ${candidate.name}`,
              materialPaths: preflight.success.writes.map((write) => write.path),
              run: Effect.gen(function* () {
                const record = recordStep(candidate);
                const project = projectStep(candidate);
                const recorded = yield* record.run;
                if (recorded.result === "error") return recorded;
                const projected = yield* project.run;
                if (projected.result === "error") return projected;
                return {
                  ...projected,
                  artifact: {
                    ...configArtifact(
                      candidate.scope,
                      candidate.replacesExistingEntry ? "updated" : "created",
                    ),
                    targets: [
                      ...(recorded.artifact?.targets ?? []),
                      ...(projected.artifact?.targets ?? []),
                    ],
                    nativeLocations: projected.artifact?.nativeLocations ?? [],
                  },
                };
              }),
            },
          ];
    const plan: Plan<AddInlineMcpServerRequirements> = {
      _tag: "Plan",
      name: "Add MCP server",
      description: Option.some(`Configure ${candidate.name} and sync agent MCP configs`),
      presentation: operationPresentation(
        { imperative: "configure", past: "Configured", gerund: "Configuring" },
        "mcp-server",
      ),
      jobs: [{ concurrency: 1, steps }],
    };
    const prepared = yield* prepareExecutionCandidate(plan);
    return yield* resolveExecutionCandidate(prepared, execution, {
      additionalFreshness: () =>
        preflight._tag === "Failure"
          ? Effect.succeed(true)
          : inspect.pipe(
              Effect.map((current) => Equal.equals(current, preflight.success)),
              Effect.orElseSucceed(() => false),
            ),
    });
  });

/** The inline MCP capability use case. */
export const AddInlineMcpServer = {
  prepare: prepareAddInlineMcpServer,
  previewOrApply: previewOrApplyAddInlineMcpServer,
} as const;

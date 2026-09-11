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
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import {
  NativeWriteAuthority,
  syncInlineMcpServerToAgents,
  type McpServerSyncTarget,
  type NativeFormatFailure,
} from "@agentxm/agent-integration";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  OperationJournal,
  ResolvePlanInteraction,
  StepFailure,
  operationPresentation,
  prepareExecutionCandidate,
  resolveExecutionCandidate,
  type JobStepArtifact,
  type JobStepResult,
  type OperationResolution,
  type Plan,
  type PlanExecution,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import {
  ConfiguredAgentOutcomesProvider,
  WorkspaceMutations,
  type WorkspaceStateReadFailure,
} from "@agentxm/workspace-state";
import { FootprintRecorder, WorkspaceTransactionScope } from "@agentxm/workspace-transactions";

import {
  WorkspaceConfigurationFailed,
  workspaceChangeFailedToStepFailure,
  type WorkspaceConfigurationExecutionFailure,
} from "../errors.js";
import type { InlineMcpDefinition } from "../mcp-import/preflight.js";
import {
  makeInlineMcpDefinition,
  matchesInlineMcpEntry,
  parseInlineMcpEnv,
  parseInlineMcpHeaders,
  validateInlineMcpRemoteUrl,
} from "./definition.js";

const plural = (count: number, singular: string): string =>
  `${String(count)} ${singular}${count === 1 ? "" : "s"}`;

const settingsDisplayPath = (scope: WorkspaceScope): string =>
  scope === "project" ? "axm.json" : ".axm/workspace/axm.json";

/**
 * Serialize a native-format failure. Every member of the family names the
 * fact that stopped it, so the sentence carries over rather than being
 * replaced by a generic one the person cannot act on.
 */
const nativeFailureToStepFailure = (failure: NativeFormatFailure): StepFailure => {
  switch (failure._tag) {
    case "McpEntryUnmanaged":
      return new StepFailure({
        category: "conflict",
        detail: `MCP server ${failure.serverName} in ${failure.configPath} is not AXM-managed`,
        cause: failure,
      });
    case "McpOwnershipMarkerInvalid":
      return new StepFailure({
        category: "conflict",
        detail: `MCP server ${failure.serverName} carries ${failure.state} AXM ownership markers`,
        cause: failure,
      });
    case "McpSharedTargetConflict":
      return new StepFailure({ category: "conflict", detail: failure.reason, cause: failure });
    case "NativeWriteRefused":
      return new StepFailure({
        category: "conflict",
        detail: `Native MCP configuration at ${failure.path} could not be protected`,
        cause: failure,
      });
    case "TransientBackupFailed":
      return new StepFailure({
        category: "internal",
        detail: "A native MCP configuration backup could not be taken",
        cause: failure,
      });
    case "WriteBackupRetained":
      return new StepFailure({
        category: "internal",
        detail: `${nativeFailureToStepFailure(failure.failure).detail}; the original content is preserved at ${failure.backupPath}`,
        cause: failure,
      });
    default:
      return new StepFailure({ category: "conflict", detail: failure.detail, cause: failure });
  }
};

export interface AddInlineMcpServerRequest {
  readonly name: string;
  /** Inline stdio command line, such as `npx -y linear-mcp-server`. */
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
  readonly definition: InlineMcpDefinition;
  readonly env: Readonly<Record<string, string>>;
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
  WorkspaceMutations
> =>
  Effect.gen(function* () {
    if (request.command === undefined && request.url === undefined) {
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
    if (request.command !== undefined && request.url !== undefined) {
      return yield* new WorkspaceConfigurationFailed({
        category: "usage",
        detail: "Use exactly one of --command or --url.",
      });
    }

    const workspace = yield* WorkspaceMutations;
    const env = yield* parseInlineMcpEnv(request.env);
    const headers = yield* parseInlineMcpHeaders(request.headers);
    if (request.url !== undefined) yield* validateInlineMcpRemoteUrl(request.url);
    const definition = yield* makeInlineMcpDefinition(
      {
        command: request.command,
        url: request.url,
      },
      headers,
    );
    const configured = yield* workspace.getConfiguredMcpServerEntries();
    const existing = configured[request.name];
    if (matchesInlineMcpEntry({ existing, definition, env })) {
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
      env,
      replacesExistingEntry: existing !== undefined,
      scope: workspace.scope,
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

const recordStep = (
  candidate: AddInlineMcpServerCandidate,
): PlannedJobStep<WorkspaceMutations> => ({
  label: `Configure ${candidate.name}`,
  readiness: "ready",
  run: Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    yield* workspace
      .setMcpServerEntry(candidate.name, {
        kind: "inline",
        ...(candidate.definition.type === "stdio"
          ? { command: candidate.definition.command, args: candidate.definition.args }
          : { url: candidate.definition.url, headers: candidate.definition.headers }),
        env: candidate.env,
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
 * configuration. An agent that refuses the write is reported as a warning
 * rather than failing the change: the workspace's own record is authoritative
 * and the next reconciliation retries the projection.
 */
const projectStep = (
  candidate: AddInlineMcpServerCandidate,
): PlannedJobStep<
  NativeWriteAuthority | WorkspaceMutations | FileSystem.FileSystem | Path.Path
> => ({
  label: `Sync ${candidate.name} to configured agents`,
  readiness: "ready",
  run: Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    const entries = yield* workspace
      .getConfiguredMcpServerEntries()
      .pipe(Effect.mapError(workspaceChangeFailedToStepFailure));
    const entry = entries[candidate.name];
    if (entry === undefined) {
      return {
        result: "success",
        message: `${candidate.name} is not configured`,
      } satisfies JobStepResult;
    }
    const agentIds = yield* workspace
      .getConfiguredAgents()
      .pipe(Effect.mapError(workspaceChangeFailedToStepFailure));
    const outcomes = yield* syncInlineMcpServerToAgents(agentIds, {
      workspaceRoot: workspace.baseDir,
      serverName: candidate.name,
      entry,
      scope: workspace.scope,
    }).pipe(Effect.mapError(nativeFailureToStepFailure));
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
  | WorkspaceMutations
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
    const plan: Plan<AddInlineMcpServerRequirements> = {
      _tag: "Plan",
      name: "Add MCP server",
      description: Option.some(`Configure ${candidate.name} and sync agent MCP configs`),
      presentation: operationPresentation(
        { imperative: "configure", past: "Configured", gerund: "Configuring" },
        "mcp-server",
      ),
      jobs: [{ concurrency: 1, steps: [recordStep(candidate), projectStep(candidate)] }],
    };
    const prepared = yield* prepareExecutionCandidate(plan);
    return yield* resolveExecutionCandidate(prepared, execution);
  });

/** The inline MCP capability use case. */
export const AddInlineMcpServer = {
  prepare: prepareAddInlineMcpServer,
  previewOrApply: previewOrApplyAddInlineMcpServer,
} as const;

import type { NativeDirectoryInputs } from "@agentxm/workspace-kernel/locations";
/**
 * The MCP server installation operation: use the MCP manager to acquire the
 * package, reconcile connection credentials, declare the accepted resolution
 * and settings entry, and project the connection into configured agents.
 *
 * The MCP manager serves it as its `installConnection` member, which is how
 * the kernel's reconciliation and Pack member steps install a connection;
 * this kind's install plan and authored-package realization call it directly.
 * Requirements stay in `R` and failures stay typed in `E`; the caller
 * composes the layer and renders the failure.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { MaterializationTargetId } from "@agentxm/extension-model/unstable/agents/types";
import {
  collectSecretInputNames,
  collectRequiredInputNames,
  mcpProjectionInputValues,
  readMcpServerManifestAt,
  syncManifestMcpServerToAgents,
  type McpServerSyncOutcome,
  type AxmMcpMetadata,
} from "@agentxm/workspace-kernel/agent-adapters";
import {
  CodingAgentRepository,
  captureAgentOutputAuthority,
} from "@agentxm/workspace-kernel/projection";
import {
  desiredReachability,
  mcpRegistryResolutionKey,
  acceptedRegistryVersionForRef,
  AcceptedResolutionWriter,
  DesiredStateReader,
  DesiredStateWriter,
  LockfileReader,
  SettingsReader,
  SettingsWriter,
  WorkspaceLocation,
  computeExtensionPathsForLayout,
  type McpServerLockEntry,
  mcpResolutionKey,
  type McpServerEntry,
} from "@agentxm/workspace-kernel/workspace-state";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import { appendWarningsToMessage, type JobStepResult } from "@agentxm/workspace-kernel/operations";
import { isWorkspaceFootprint, readFootprint } from "@agentxm/workspace-kernel/settlement";
import { classifyInstallChange } from "@agentxm/workspace-kernel/reconciliation";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import type { McpServerManifest } from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import {
  McpServerManager,
  McpSecretStore,
  mcpSecretAccount,
  type ExtensionManagerFailure,
  type InstallMcpServerOperation,
  type McpConnectionInstallRequirements,
  type McpSecretIdentity,
} from "@agentxm/workspace-kernel/materialization";
import {
  agentConfigTargets,
  mcpServerArtifact,
  mcpSettingsTarget,
  mcpSourceTarget,
} from "../artifact.js";
import { McpAgentSyncRefused, McpRequiredInputsMissing } from "../errors.js";
import { requestedMcpSourceIdentity } from "../source-identity.js";

// -----------------------------------------------------------------------------
// Credentials
// -----------------------------------------------------------------------------

type McpSecretPersistenceOutcome =
  | { readonly _tag: "saved"; readonly inputName: string }
  | { readonly _tag: "skipped"; readonly inputName: string }
  | { readonly _tag: "failed"; readonly inputName: string };

export type McpSecretDeletionOutcome =
  | { readonly _tag: "deleted"; readonly inputName: string }
  | { readonly _tag: "absent"; readonly inputName: string }
  | { readonly _tag: "failed"; readonly inputName: string };

const isNothingRunnableManifest = (manifest: Option.Option<McpServerManifest>): boolean =>
  Option.match(manifest, {
    onNone: () => false,
    onSome: (value) =>
      (value.server.packages === undefined || value.server.packages.length === 0) &&
      (value.server.remotes === undefined || value.server.remotes.length === 0),
  });

const loadStoredMcpSecrets = (
  identity: McpSecretIdentity,
  secretNames: ReadonlySet<string>,
): Effect.Effect<Readonly<Record<string, string>>, never, McpSecretStore> =>
  Effect.gen(function* () {
    const secrets = yield* McpSecretStore;
    const entries = yield* Effect.forEach(
      secretNames,
      (name) =>
        secrets
          .read(mcpSecretAccount({ ...identity, inputName: name }))
          .pipe(Effect.map((value) => ({ name, value }))),
      { concurrency: 1 },
    );
    const loaded: Record<string, string> = {};
    for (const { name, value } of entries) {
      if (Option.isSome(value)) loaded[name] = value.value;
    }
    return loaded;
  });

const persistMcpSecrets = (
  identity: McpSecretIdentity,
  secretNames: ReadonlySet<string>,
  values: Readonly<Record<string, string>>,
): Effect.Effect<ReadonlyArray<McpSecretPersistenceOutcome>, never, McpSecretStore> =>
  Effect.gen(function* () {
    const secrets = yield* McpSecretStore;
    return yield* Effect.forEach(
      secretNames,
      (inputName): Effect.Effect<McpSecretPersistenceOutcome> => {
        const value = values[inputName];
        return value === undefined || value === `\${${inputName}}`
          ? Effect.succeed({ _tag: "skipped", inputName })
          : secrets
              .write(mcpSecretAccount({ ...identity, inputName }), value)
              .pipe(Effect.map((outcome) => ({ _tag: outcome, inputName })));
      },
      { concurrency: 1 },
    );
  });

/**
 * Erase every credential one connection holds. Erasure is reported per input:
 * a credential store that is unavailable leaves the secret behind and says so,
 * rather than failing the removal that has already settled.
 */
export const deleteMcpSecrets = (
  identity: McpSecretIdentity,
  secretNames: ReadonlySet<string>,
): Effect.Effect<ReadonlyArray<McpSecretDeletionOutcome>, never, McpSecretStore> =>
  Effect.gen(function* () {
    const secrets = yield* McpSecretStore;
    return yield* Effect.forEach(
      secretNames,
      (inputName) =>
        secrets
          .erase(mcpSecretAccount({ ...identity, inputName }))
          .pipe(
            Effect.map(
              (outcome) => ({ _tag: outcome, inputName }) satisfies McpSecretDeletionOutcome,
            ),
          ),
      { concurrency: 1 },
    );
  });

const redactSettingsEnv = (
  values: Readonly<Record<string, string>>,
  secretNames: ReadonlySet<string>,
): Readonly<Record<string, string>> => {
  const redacted: Record<string, string> = {};
  for (const [name, value] of Object.entries(values)) {
    if (!secretNames.has(name) || value === `\${${name}}`) redacted[name] = value;
  }
  return redacted;
};

interface AgentOutcome {
  readonly agentId: MaterializationTargetId;
  readonly outcome: McpServerSyncOutcome;
}

interface AgentSyncSummary {
  readonly status: "green" | "degraded";
  readonly details: ReadonlyArray<string>;
  readonly warnings: ReadonlyArray<string>;
  readonly outcomes: ReadonlyArray<AgentOutcome>;
}

const formatAgentSyncWarning = (
  serverName: string,
  outcomes: ReadonlyArray<AgentOutcome>,
): string => {
  const warningMessage = outcomes
    .map(({ agentId, outcome }) =>
      outcome._tag === "success" ? `${agentId}:success` : `${agentId}:${outcome.reason}`,
    )
    .join(", ");

  return `MCP agent sync warnings for ${serverName}: ${warningMessage}`;
};

const summarizeAgentSync = (
  outcomes: ReadonlyArray<AgentOutcome>,
  warnings: ReadonlyArray<string>,
): AgentSyncSummary => {
  const degraded = outcomes.some(({ outcome }) => outcome._tag === "failed");
  const details = outcomes.map(({ agentId, outcome }) => `${agentId}:${outcome._tag}`);

  return {
    status: degraded ? "degraded" : "green",
    details,
    warnings,
    outcomes,
  };
};

const syncConfiguredAgentsOnInstall = (args: {
  readonly wsBaseDir: string;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly scope: "project" | "user";
  readonly strict: boolean;
  readonly serverName: string;
  readonly canonicalPath: string;
  readonly owner: Handle;
  readonly resolvedVersion: string;
  readonly nothingRunnable: boolean;
  readonly enabled: boolean;
  readonly configValues: Readonly<Record<string, string>>;
  readonly entry: McpServerEntry;
  readonly nativeInsertionEligible: boolean;
  readonly nativeInsertionEligiblePaths?: ReadonlySet<string>;
  readonly previousManagedEntries: ReadonlyArray<AxmMcpMetadata>;
}) =>
  Effect.gen(function* () {
    const agentRepo = yield* CodingAgentRepository;
    const warnings: Array<string> = [];

    const unknownConfiguredAgentIds = yield* agentRepo.getUnknownConfiguredAgentIds();
    if (args.strict && unknownConfiguredAgentIds.length > 0) {
      return yield* new McpAgentSyncRefused({
        serverName: args.serverName,
        fault: "unknown-agents",
        agentIds: unknownConfiguredAgentIds,
      });
    }

    if (unknownConfiguredAgentIds.length > 0) {
      warnings.push(`Skipping unknown configured agents: ${unknownConfiguredAgentIds.join(", ")}`);
    }

    const configuredAgents = yield* agentRepo.getConfiguredAgents();
    const configuredAgentIds = configuredAgents.map(({ id }) => id);

    let outcomes: ReadonlyArray<AgentOutcome>;
    if (args.nothingRunnable) {
      outcomes = configuredAgents.map((agent) => ({
        agentId: agent.id,
        outcome: {
          _tag: "nothing-runnable",
          reason: "manifest server has no packages or remotes",
        },
      }));
    } else {
      const synced = yield* syncManifestMcpServerToAgents({
        agentIds: configuredAgentIds,
        workspaceRoot: args.wsBaseDir,
        nativeDirectoryInputs: args.nativeDirectoryInputs,
        scope: args.scope,
        serverName: args.serverName,
        canonicalPath: args.canonicalPath,
        owner: args.owner,
        resolvedVersion: args.resolvedVersion,
        enabled: args.enabled,
        configValues: args.configValues,
        nativeInsertionEligible: args.nativeInsertionEligible,
        ...(args.nativeInsertionEligiblePaths === undefined
          ? {}
          : { nativeInsertionEligiblePaths: args.nativeInsertionEligiblePaths }),
        previousManagedEntries: args.previousManagedEntries,
      });
      outcomes = configuredAgentIds.map((agentId, index) => ({
        agentId,
        outcome: synced[index] ?? {
          _tag: "failed" as const,
          reason: "Agent sync returned no outcome",
        },
      }));
    }

    const failed = Array.filter(outcomes, ({ outcome }) => outcome._tag === "failed");
    if (args.strict && failed.length > 0) {
      return yield* new McpAgentSyncRefused({
        serverName: args.serverName,
        fault: "failed",
        agentIds: failed.map(({ agentId }) => agentId),
      });
    }

    const warningOutcomes = Array.filter(
      outcomes,
      ({ outcome }) =>
        outcome._tag === "unsupported" ||
        outcome._tag === "nothing-runnable" ||
        outcome._tag === "needs-input" ||
        outcome._tag === "failed",
    );
    if (warningOutcomes.length > 0) {
      warnings.push(formatAgentSyncWarning(args.serverName, warningOutcomes));
    }

    return summarizeAgentSync(outcomes, warnings);
  });

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Install one MCP server: acquire the package (registry archive or the
 * workspace-authored directory), merge the connection's inputs with what the
 * credential store already holds, record the settings entry and the accepted
 * resolution, and project the connection into every configured agent.
 *
 * Failures stay typed: a refused request, an unrepresentable connection, and a
 * credential store that will not persist a secret are three different facts,
 * and the caller decides how each is reported.
 */
export const installMcpServer: (
  op: InstallMcpServerOperation,
) => Effect.Effect<
  Extract<JobStepResult, { readonly result: "success" }>,
  ExtensionManagerFailure,
  McpServerManager | McpConnectionInstallRequirements
> = (op) =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const settingsWriter = yield* SettingsWriter;
    const lockfile = yield* LockfileReader;
    const desiredStateReader = yield* DesiredStateReader;
    const desiredStateWriter = yield* DesiredStateWriter;
    const accepted = yield* AcceptedResolutionWriter;
    const manager = yield* McpServerManager;
    const layout = yield* Ref.get(location.layout);
    const path = yield* Path.Path;
    const { ref } = op.args;
    const localName = op.args.declaration?.name ?? op.args.localName ?? ref.server.name;
    // Everything from here on that durably changes the workspace records a
    // footprint; the change this install reports is classified from it.
    const footprintBefore = (yield* readFootprint).length;

    const strictAgentSync = Option.getOrElse(op.args.strictAgentSync ?? Option.none(), () => false);
    const env = Option.getOrElse(op.args.env ?? Option.none(), () => ({}));
    const requestedRegistryKey =
      ref.refType === "registry"
        ? mcpRegistryResolutionKey({
            authority: ref.source.location,
            owner: ref.owner,
            name: ref.server.name,
          })
        : undefined;
    const desiredGraph = yield* desiredStateReader.graph();
    const nativeInsertionEligible =
      op.args.nativeInsertionEligible ??
      desiredReachability(desiredGraph, { type: "mcp-server", name: localName }).decision ===
        "not-reached";
    const nativeAuthority = yield* captureAgentOutputAuthority();
    const sourceIdentity = op.args.sourceIdentity ?? (yield* requestedMcpSourceIdentity(ref));
    const existingClosure = desiredGraph.mcpSourceClosures.find(
      (closure) => closure.key === sourceIdentity,
    );
    const acceptedEntry =
      ref.refType === "registry"
        ? yield* lockfile.entry("mcp-server", requestedRegistryKey ?? "")
        : Option.none<McpServerLockEntry>();
    const lockedVersion =
      ref.refType === "registry" ? acceptedRegistryVersionForRef(acceptedEntry, ref) : undefined;
    const facts = yield* manager.materializeInstall({
      ref,
      force: op.args.force,
      nativeInsertionEligible,
    });
    const resolution = yield* manager.acceptedResolution({
      ref,
      materialization: Option.some(facts),
    });
    const canonicalPath =
      ref.refType === "workspace"
        ? ref.location
        : computeExtensionPathsForLayout(path.join, layout, ref, "mcps", ref.name).canonicalPath;
    const lockEntry = Option.getOrUndefined(resolution)?.entry;
    const resolutionKey = Option.getOrUndefined(resolution)?.key;
    const manifest = yield* readMcpServerManifestAt(canonicalPath);
    const resolvedVersion =
      ref.refType === "registry" || ref.refType === "workspace"
        ? ref.version
        : Option.match(manifest, { onNone: () => "0.0.0", onSome: (value) => value.version });
    const nothingRunnable = isNothingRunnableManifest(manifest);
    const secretNames = Option.match(manifest, {
      onNone: () => new Set<string>(),
      onSome: collectSecretInputNames,
    });

    const currentMcpServers = yield* settings.entries("mcp-server");
    const currentEntry = currentMcpServers[localName];
    const installedBefore =
      desiredGraph.nodes.some((node) => node.type === "mcp-server" && node.name === localName) ||
      currentEntry !== undefined;
    const secretIdentity = {
      scopeRoot: path.resolve(location.baseDir),
      localName,
      sourceIdentity,
    };
    const storedSecrets = yield* loadStoredMcpSecrets(secretIdentity, secretNames);
    const mergedEnv = { ...storedSecrets, ...(currentEntry?.env ?? {}), ...env };

    // Where no prompt can open — machine output, --non-interactive, CI, or a
    // terminal that cannot paint one — nobody can supply a required input, so
    // a server that could not start must not be installed. Fail with the exact
    // recipe instead.
    const requiredInputNames = Option.match(manifest, {
      onNone: () => new Set<string>(),
      onSome: collectRequiredInputNames,
    });
    const missingInputs = [...requiredInputNames]
      .filter((name) => mergedEnv[name] === undefined || mergedEnv[name] === "")
      .sort((left, right) => left.localeCompare(right));
    if (missingInputs.length > 0 && op.args.nonInteractive) {
      return yield* new McpRequiredInputsMissing({ localName, inputNames: missingInputs });
    }
    const persistedEnv = redactSettingsEnv(mergedEnv, secretNames);
    const enabled = currentEntry?.enabled ?? true;
    const settingsEntry: McpServerEntry = {
      kind: "sourced",
      source: ref.refType === "workspace" ? "workspace" : printSourceParams(ref.source),
      env: persistedEnv,
      enabled,
    };
    const writeEffect =
      op.args.declaration === undefined
        ? lockEntry === undefined
          ? Effect.void
          : accepted.setAccepted("mcp-server", resolutionKey ?? ref.server.name, lockEntry)
        : lockEntry === undefined
          ? settingsWriter.setEntry("mcp-server", localName, {
              ...settingsEntry,
            })
          : desiredStateWriter.declare("mcp-server", {
              name: localName,
              resolutionKey: resolutionKey ?? mcpResolutionKey(lockEntry),
              lockEntry,
              versionRange: op.args.declaration.versionRange,
              env: persistedEnv,
              enabled,
            });
    yield* writeEffect;

    const projectionNames =
      ref.refType === "registry" && lockedVersion !== undefined && lockedVersion !== ref.version
        ? [...new Set([...(existingClosure?.localNames ?? []), localName])].sort()
        : [localName];
    const agentSyncResults = yield* Effect.forEach(
      projectionNames,
      (projectionName) =>
        Effect.gen(function* () {
          const projectionEntry =
            projectionName === localName ? settingsEntry : currentMcpServers[projectionName];
          if (projectionEntry === undefined || projectionEntry.kind === "inline") {
            return undefined;
          }
          const projectionSecretIdentity = {
            scopeRoot: path.resolve(location.baseDir),
            localName: projectionName,
            sourceIdentity,
          };
          const projectionStoredSecrets = yield* loadStoredMcpSecrets(
            projectionSecretIdentity,
            secretNames,
          );
          const projectionEnv =
            projectionName === localName
              ? mergedEnv
              : { ...projectionStoredSecrets, ...projectionEntry.env };
          return yield* syncConfiguredAgentsOnInstall({
            wsBaseDir: location.baseDir,
            nativeDirectoryInputs: location.nativeDirectoryInputs,
            scope: location.scope,
            strict: strictAgentSync,
            serverName: projectionName,
            canonicalPath,
            owner: ref.owner,
            resolvedVersion,
            nothingRunnable,
            enabled: projectionEntry.enabled !== false,
            configValues: mcpProjectionInputValues(projectionEnv, secretNames),
            entry: projectionEntry,
            nativeInsertionEligible: projectionName === localName && nativeInsertionEligible,
            ...(op.args.nativeInsertionEligiblePaths === undefined
              ? {}
              : { nativeInsertionEligiblePaths: op.args.nativeInsertionEligiblePaths }),
            previousManagedEntries: nativeAuthority.expectedMcpEntries[projectionName] ?? [],
          });
        }),
      { concurrency: 1 },
    );
    const agentSyncSummaries = agentSyncResults.filter(
      (summary): summary is AgentSyncSummary => summary !== undefined,
    );
    const agentSync: AgentSyncSummary = {
      status: agentSyncSummaries.some((summary) => summary.status === "degraded")
        ? "degraded"
        : "green",
      details: agentSyncSummaries.flatMap((summary) => summary.details),
      warnings: agentSyncSummaries.flatMap((summary) => summary.warnings),
      outcomes: agentSyncSummaries.flatMap((summary) => summary.outcomes),
    };

    const secretPersistence = yield* persistMcpSecrets(secretIdentity, secretNames, mergedEnv);
    const secretWarnings = secretPersistence.flatMap((outcome) =>
      outcome._tag === "failed"
        ? [
            `${outcome.inputName} could not be saved to the system keychain; AXM state was applied and credential action is required`,
          ]
        : [],
    );

    const warnings = [...secretWarnings, ...agentSync.warnings];
    const change = classifyInstallChange({
      installedBefore,
      footprint: (yield* readFootprint)
        .slice(footprintBefore)
        .filter(isWorkspaceFootprint(path, location.baseDir)),
    });
    const agentOutcomes = agentSync.outcomes.map(({ agentId, outcome }) => ({
      agentId,
      ...(outcome.targets === undefined ? {} : { targets: outcome.targets }),
    }));

    return {
      result: "success",
      message: appendWarningsToMessage(
        `Installed ${localName} from ${ref.owner}/mcps/${ref.server.name} (canonical=success, agent-sync=${agentSync.status})`,
        warnings,
      ),
      ...(change === "unchanged" ? { disposition: "unchanged" as const } : {}),
      artifact: mcpServerArtifact({
        lockEntry,
        scope: location.scope,
        change,
        agents: agentOutcomes.map(({ agentId }) => agentId),
        nativeLocations: agentOutcomes.flatMap(({ targets }) =>
          (targets ?? []).flatMap((target) =>
            target.nativeLocation === undefined ? [] : [target.nativeLocation],
          ),
        ),
        targets: [
          ...(lockEntry === undefined ? [] : [mcpSourceTarget(location.scope, lockEntry, change)]),
          mcpSettingsTarget(location.scope, change),
          ...agentConfigTargets(agentOutcomes),
        ],
      }),
    } satisfies JobStepResult;
  });

/**
 * The MCP server installation operation: acquire the package, reconcile the
 * connection's credentials, record the accepted resolution and the settings
 * entry, and project the connection into every configured agent.
 *
 * It lives in the reconciliation capability rather than in a feature because
 * four surfaces need it — `axm mcps install`, pack member installation,
 * reconciliation, and the authoring routes that install an MCP server they
 * have just scaffolded, forked, adopted, or imported — and a feature may not
 * import a peer feature. Requirements stay in `R` and failures stay typed in
 * `E`; the caller composes the layer and renders the failure.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { AgentId } from "@agentxm/extension-model/unstable/agents/types";
import { NativeWriteAuthority, syncManifestMcpServerToAgents } from "@agentxm/agent-integration";
import type { McpServerSyncOutcome } from "@agentxm/agent-integration";
import { CodingAgentRepository } from "@agentxm/workspace-projection";
import { mcpRegistryResolutionKey } from "@agentxm/workspace-state";
import { isPathSafe } from "@agentxm/extension-model/unstable/path-types";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  acceptedRegistryVersionForRef,
  validateExactResolvedVersion,
} from "@agentxm/workspace-state";
import { appendWarningsToMessage } from "@agentxm/workspace-operations";
import type { JobStepResult, Operation } from "@agentxm/workspace-operations";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { canReuseInstalledPackage } from "@agentxm/extension-materialization";
import { materializeRegistryPackage } from "@agentxm/extension-materialization";
import { computeExtensionPathsForLayout } from "@agentxm/workspace-state";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import type {
  McpServerExtensionRef,
  RegistryMcpServerRef,
} from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { McpServerLockEntry } from "@agentxm/workspace-state";
import { computeMaterializedTreeIntegrity, type TreeIntegrity } from "@agentxm/workspace-state";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import {
  MCP_SERVER_MANIFEST_FILENAME,
  type McpRegistryArgument,
  type McpRegistryInput,
  type McpRegistryKeyValueInput,
  type McpServerManifest,
  McpServerManifestSchema,
} from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import type { McpServerEntry } from "@agentxm/workspace-state";
import {
  agentConfigTargets,
  mcpServerArtifact,
  mcpSettingsTarget,
  mcpSourceTarget,
} from "@agentxm/extension-materialization";
import type { ExtensionManagerFailure } from "@agentxm/extension-materialization";
import {
  McpAgentSyncRefused,
  McpCanonicalPathUnsafe,
  McpLocalNameConflict,
  McpRegistryOnlyInstall,
  McpRequiredInputsMissing,
  McpWorkspacePackageInvalid,
} from "@agentxm/extension-materialization";
import {
  McpSecretStore,
  mcpSecretAccount,
  type McpSecretIdentity,
} from "@agentxm/extension-materialization";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Args for the install-mcp-server operation.
 */
export type InstallMcpServerOperationArgs = {
  readonly ref: McpServerExtensionRef;
  /** Local connection identity and exact agent-native MCP key. */
  readonly localName?: string;
  readonly force: boolean;
  /** Explicit connection declaration; absent when realizing inherited or authored state. */
  readonly declaration?: { readonly name: string; readonly versionRange: Option.Option<string> };
  /** When true, enforce strict policy for MCP sync outcomes. */
  readonly strictAgentSync?: Option.Option<boolean>;
  /** Resolved MCP input values from `--env KEY=VALUE` flags. */
  readonly env?: Option.Option<Readonly<Record<string, string>>>;
  /**
   * Whether the invoking surface can prompt for missing required inputs.
   * The transport boundary resolves flag, CI, and TTY state.
   */
  readonly nonInteractive: boolean;
};

/**
 * Add an MCP server to the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type InstallMcpServerOperation = Operation<
  "install-mcp-server",
  InstallMcpServerOperationArgs
>;

// -----------------------------------------------------------------------------
// Lock entry builder
// -----------------------------------------------------------------------------

const buildLockEntry = (
  ref: RegistryMcpServerRef,
  treeIntegrity: TreeIntegrity,
): McpServerLockEntry => ({
  type: "registry",
  sourceType: "registry",
  packageFormat: "agentxm",
  endpoint: ref.source.location,
  extensionType: "mcp-server",
  workspaceName: ref.server.name,
  owner: ref.owner,
  name: ref.name,
  resolvedVersion: decodeVersionSync(ref.version),
  integrity: Option.getOrElse(ref.integrity, () => ""),
  sourceName: ref.source.name,
  publisherBindingId: ref.publisherBindingId,
  treeIntegrity,
});

type McpSecretPersistenceOutcome =
  | { readonly _tag: "saved"; readonly inputName: string }
  | { readonly _tag: "skipped"; readonly inputName: string }
  | { readonly _tag: "failed"; readonly inputName: string };

export type McpSecretDeletionOutcome =
  | { readonly _tag: "deleted"; readonly inputName: string }
  | { readonly _tag: "absent"; readonly inputName: string }
  | { readonly _tag: "failed"; readonly inputName: string };

const maybeSecretInputName = (
  input: McpRegistryInput | McpRegistryKeyValueInput | McpRegistryArgument,
): string | undefined => {
  if (input.isSecret !== true) return undefined;
  if ("name" in input) return input.name;
  if ("valueHint" in input) return input.valueHint;
  return undefined;
};

/**
 * Named environment inputs the manifest marks required. Only key/value inputs
 * are collected: an unnamed input has nothing a caller could pass through
 * `--env KEY=VALUE`, so it cannot be reported as a missing name.
 */
const collectRequiredInputNames = (manifest: McpServerManifest): ReadonlySet<string> => {
  const names = new Set<string>();
  const add = (input: McpRegistryKeyValueInput) => {
    if (input.isRequired === true && input.value === undefined && input.default === undefined) {
      names.add(input.name);
    }
  };

  for (const pkg of manifest.server.packages ?? []) {
    for (const input of pkg.environmentVariables ?? []) add(input);
  }

  for (const remote of manifest.server.remotes ?? []) {
    for (const input of remote.headers ?? []) add(input);
  }

  return names;
};

export const collectSecretInputNames = (manifest: McpServerManifest): ReadonlySet<string> => {
  const names = new Set<string>();
  const add = (input: McpRegistryInput | McpRegistryKeyValueInput | McpRegistryArgument) => {
    const name = maybeSecretInputName(input);
    if (name !== undefined) names.add(name);
  };

  for (const pkg of manifest.server.packages ?? []) {
    for (const input of pkg.environmentVariables ?? []) add(input);
    for (const input of pkg.runtimeArguments ?? []) add(input);
    for (const input of pkg.packageArguments ?? []) add(input);
  }

  for (const remote of manifest.server.remotes ?? []) {
    for (const input of remote.headers ?? []) add(input);
    for (const [name, input] of Object.entries(remote.variables ?? {})) {
      if (input.isSecret === true) names.add(name);
    }
  }

  return names;
};

// -----------------------------------------------------------------------------
// Registry install
// -----------------------------------------------------------------------------

const installFromRegistry = (
  ref: RegistryMcpServerRef,
  reuse: { readonly force: boolean; readonly lockedVersion: string | undefined },
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;

    const canonicalPath = computeExtensionPathsForLayout(
      path.join,
      ws.layout,
      ref,
      "mcps",
      ref.name,
    ).canonicalPath;

    if (!isPathSafe(path, ws.baseDir, canonicalPath)) {
      return yield* new McpCanonicalPathUnsafe({ serverName: ref.name, canonicalPath });
    }

    const useExisting = yield* canReuseInstalledPackage({
      installedPath: canonicalPath,
      force: reuse.force,
      refVersion: ref.version,
      hasIntegrity: Option.isSome(ref.integrity),
      ...(reuse.lockedVersion === undefined ? {} : { lockedVersion: reuse.lockedVersion }),
      existsFailureDetail: (target) => `Failed to check if canonical path exists: ${target}`,
    });

    if (!useExisting) {
      yield* materializeRegistryPackage({
        baseDir: ws.baseDir,
        destinationPath: canonicalPath,
        sourceLocation: ref.source.location,
        owner: ref.owner,
        type: "mcp-server",
        name: ref.name,
        version: ref.version,
        integrity: ref.integrity,
        messages: {
          integrityMismatchDetail: `Integrity mismatch for ${ref.name}@${ref.version}`,
        },
      });
    }

    return canonicalPath;
  });

export const readMcpServerManifest = (
  canonicalPath: string,
): Effect.Effect<Option.Option<McpServerManifest>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const manifestPath = path.join(canonicalPath, MCP_SERVER_MANIFEST_FILENAME);
    const exists = yield* fs.exists(manifestPath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) {
      return Option.none();
    }

    const manifest = yield* fs.readFileString(manifestPath).pipe(
      Effect.flatMap((raw) =>
        Effect.try({
          try: () => {
            const parsed: unknown = JSON.parse(raw);
            return Schema.decodeUnknownSync(McpServerManifestSchema)(parsed);
          },
          catch: () => undefined,
        }),
      ),
      Effect.catch(() => Effect.void),
    );

    if (manifest === undefined) {
      return Option.none();
    }

    return Option.some(manifest);
  });

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
      { concurrency: "unbounded" },
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
      { concurrency: "unbounded" },
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
      { concurrency: "unbounded" },
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

const preserveSecretReferences = (
  values: Readonly<Record<string, string>>,
  secretNames: ReadonlySet<string>,
): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      secretNames.has(name) ? `\${${name}}` : value,
    ]),
  );

const REQUIRED_AGENT_IDS: ReadonlySet<AgentId> = new Set<AgentId>([
  "claude-code",
  "opencode",
  "github-copilot-cli",
  "cursor",
  "gemini-cli",
  "codex",
]);

interface AgentOutcome {
  readonly agentId: AgentId;
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
      outcome._tag === "success"
        ? `${agentId}:success`
        : outcome._tag === "fallback"
          ? `${agentId}:fallback(${outcome.fallbackFrom}):${outcome.reason}`
          : `${agentId}:${outcome.reason}`,
    )
    .join(", ");

  return `MCP agent sync warnings for ${serverName}: ${warningMessage}`;
};

const summarizeAgentSync = (
  outcomes: ReadonlyArray<AgentOutcome>,
  warnings: ReadonlyArray<string>,
): AgentSyncSummary => {
  const degraded = outcomes.some(
    ({ outcome }) => outcome._tag === "failed" || outcome._tag === "fallback",
  );
  const details = outcomes.map(({ agentId, outcome }) =>
    outcome._tag === "success"
      ? `${agentId}:success`
      : outcome._tag === "fallback"
        ? `${agentId}:fallback:${outcome.fallbackFrom}`
        : `${agentId}:${outcome._tag}`,
  );

  return {
    status: degraded ? "degraded" : "green",
    details,
    warnings,
    outcomes,
  };
};

const syncConfiguredAgentsOnInstall = (args: {
  readonly wsBaseDir: string;
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
        scope: args.scope,
        serverName: args.serverName,
        canonicalPath: args.canonicalPath,
        owner: args.owner,
        resolvedVersion: args.resolvedVersion,
        enabled: args.enabled,
        configValues: args.configValues,
      });
      outcomes = configuredAgentIds.map((agentId, index) => ({
        agentId,
        outcome: synced[index] ?? {
          _tag: "failed" as const,
          reason: "Agent sync returned no outcome",
        },
      }));
    }

    const misconfigured = Array.filter(outcomes, ({ outcome }) => outcome._tag === "misconfigured");
    if (misconfigured.length > 0) {
      return yield* new McpAgentSyncRefused({
        serverName: args.serverName,
        fault: "misconfigured",
        agentIds: misconfigured.map(({ agentId }) => agentId),
      });
    }

    const failed = Array.filter(outcomes, ({ outcome }) => outcome._tag === "failed");
    if (args.strict && failed.length > 0) {
      return yield* new McpAgentSyncRefused({
        serverName: args.serverName,
        fault: "failed",
        agentIds: failed.map(({ agentId }) => agentId),
      });
    }

    const strictDisabledFailures = Array.filter(
      outcomes,
      ({ agentId, outcome }) =>
        (outcome._tag === "disabled" ||
          (outcome._tag === "fallback" && outcome.fallbackFrom === "disabled")) &&
        args.strict &&
        REQUIRED_AGENT_IDS.has(agentId),
    );
    if (strictDisabledFailures.length > 0) {
      return yield* new McpAgentSyncRefused({
        serverName: args.serverName,
        fault: "disabled",
        agentIds: strictDisabledFailures.map(({ agentId }) => agentId),
      });
    }

    const warningOutcomes = Array.filter(
      outcomes,
      ({ outcome }) =>
        outcome._tag === "unsupported" ||
        outcome._tag === "disabled" ||
        outcome._tag === "nothing-runnable" ||
        outcome._tag === "needs-input" ||
        outcome._tag === "failed" ||
        outcome._tag === "fallback",
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
 * Everything the MCP install operation needs from its composition root.
 */
export type McpServerInstallRequirements =
  | FileSystem.FileSystem
  | HttpClient.HttpClient
  | Path.Path
  | WorkspaceMutations
  | CodingAgentRepository
  | NativeWriteAuthority
  | McpSecretStore;

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
) => Effect.Effect<JobStepResult, ExtensionManagerFailure, McpServerInstallRequirements> = (op) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const path = yield* Path.Path;
    const { ref } = op.args;
    const localName = op.args.declaration?.name ?? op.args.localName ?? ref.server.name;

    if (ref.refType !== "registry" && ref.refType !== "workspace") {
      return yield* new McpRegistryOnlyInstall({
        serverName: ref.server.name,
        refType: ref.refType,
      });
    }

    const strictAgentSync = Option.getOrElse(op.args.strictAgentSync ?? Option.none(), () => false);
    const env = Option.getOrElse(op.args.env ?? Option.none(), () => ({}));
    const resolutionKey =
      ref.refType === "registry"
        ? mcpRegistryResolutionKey({
            authority: ref.source.location,
            owner: ref.owner,
            name: ref.server.name,
          })
        : undefined;
    const sourceIdentity = resolutionKey ?? `workspace:${ref.owner}/mcps/${ref.server.name}`;
    const desiredGraph = yield* ws.getDesiredStateGraph();
    const existingLocalNode = desiredGraph.nodes.find(
      (node) => node.type === "mcp-server" && node.name === localName,
    );
    if (
      existingLocalNode !== undefined &&
      (existingLocalNode.authority === "inline" || existingLocalNode.identity !== sourceIdentity)
    ) {
      return yield* new McpLocalNameConflict({
        localName,
        requestedIdentity: sourceIdentity,
        owningIdentity:
          existingLocalNode.authority === "inline" ? "inline" : existingLocalNode.identity,
      });
    }
    const existingClosure = desiredGraph.mcpSourceClosures.find(
      (closure) => closure.identity === sourceIdentity,
    );
    const lockedVersion =
      ref.refType === "registry"
        ? acceptedRegistryVersionForRef(yield* ws.getLockedMcpServer(resolutionKey ?? ""), ref)
        : undefined;
    const canonicalPath =
      ref.refType === "registry"
        ? yield* installFromRegistry(ref, { force: op.args.force, lockedVersion })
        : yield* Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const path = yield* Path.Path;
            const expectedPath = path.join(
              ws.layout.scope === "project"
                ? ws.layout.authoredRoot("mcp-server")
                : path.join(ws.layout.acquiredRoot, ref.owner, "mcps"),
              ref.name,
            );
            if (
              ref.scope !== ws.scope ||
              path.resolve(ref.location) !== path.resolve(expectedPath)
            ) {
              return yield* new McpWorkspacePackageInvalid({
                serverName: ref.server.name,
                location: ref.location,
                fault: "outside-workspace",
              });
            }
            const exists = yield* fs.exists(ref.location).pipe(
              Effect.mapError(
                (error) =>
                  new McpWorkspacePackageInvalid({
                    serverName: ref.server.name,
                    location: ref.location,
                    fault: "unreadable",
                    cause: error,
                  }),
              ),
            );
            if (!exists) {
              return yield* new McpWorkspacePackageInvalid({
                serverName: ref.server.name,
                location: ref.location,
                fault: "missing",
              });
            }
            return ref.location;
          });
    const manifest = yield* readMcpServerManifest(canonicalPath);
    const nothingRunnable = isNothingRunnableManifest(manifest);
    const secretNames = Option.match(manifest, {
      onNone: () => new Set<string>(),
      onSome: collectSecretInputNames,
    });

    if (ref.refType === "registry") {
      yield* validateExactResolvedVersion(
        `mcpServers.${ref.server.name}.resolvedVersion`,
        ref.version,
      );
    }

    const lockEntry =
      ref.refType === "registry"
        ? buildLockEntry(ref, yield* computeMaterializedTreeIntegrity(canonicalPath))
        : undefined;
    const currentMcpServers = yield* ws.getConfiguredMcpServerEntries();
    const currentEntry = currentMcpServers[localName];
    const secretIdentity = {
      scopeRoot: path.resolve(ws.baseDir),
      localName,
      sourceIdentity,
    };
    const storedSecrets = yield* loadStoredMcpSecrets(secretIdentity, secretNames);
    const mergedEnv = { ...storedSecrets, ...(currentEntry?.env ?? {}), ...env };

    // Under --non-interactive there is nobody to prompt, so a required input
    // that nothing supplied would otherwise install a server that cannot start.
    // Fail with the exact recipe instead.
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
          : ws.setMcpServerLock({
              name: resolutionKey ?? ref.server.name,
              resolutionKey: resolutionKey ?? ref.server.name,
              lockEntry,
              versionRange: Option.none(),
            })
        : lockEntry === undefined
          ? ws.setMcpServerEntry(localName, {
              ...settingsEntry,
            })
          : ws.setMcpServer({
              name: localName,
              resolutionKey: resolutionKey ?? localName,
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
            scopeRoot: path.resolve(ws.baseDir),
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
            wsBaseDir: ws.baseDir,
            scope: ws.scope,
            strict: strictAgentSync,
            serverName: projectionName,
            canonicalPath,
            owner: ref.owner,
            resolvedVersion: ref.version,
            nothingRunnable,
            enabled: projectionEntry.enabled,
            configValues: preserveSecretReferences(projectionEnv, secretNames),
            entry: projectionEntry,
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
    const change = currentEntry === undefined ? "created" : "updated";
    const agentOutcomes = agentSync.outcomes.flatMap(({ agentId, outcome }) =>
      outcome._tag === "success" || outcome._tag === "fallback"
        ? [
            {
              agentId,
              ...(outcome.targets === undefined ? {} : { targets: outcome.targets }),
            },
          ]
        : [],
    );

    return {
      result: "success",
      message: appendWarningsToMessage(
        `Installed ${localName} from ${ref.owner}/mcps/${ref.server.name} (canonical=success, agent-sync=${agentSync.status})`,
        warnings,
      ),
      artifact: mcpServerArtifact({
        lockEntry,
        scope: ws.scope,
        change,
        agents: agentOutcomes.map(({ agentId }) => agentId),
        targets: [
          ...(lockEntry === undefined ? [] : [mcpSourceTarget(ws.scope, lockEntry, change)]),
          mcpSettingsTarget(ws.scope, change),
          ...agentConfigTargets(agentOutcomes),
        ],
      }),
    } satisfies JobStepResult;
  });

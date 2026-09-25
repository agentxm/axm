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
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { AgentId } from "@agentxm/extension-model/unstable/agents/types";
import {
  collectSecretInputNames,
  mcpProjectionInputValues,
  NativeWriteAuthority,
  syncManifestMcpServerToAgents,
} from "../../projection/agent-adapters/index.js";
import type { McpServerSyncOutcome } from "../../projection/agent-adapters/index.js";
import { CodingAgentRepository } from "../../projection/index.js";
import {
  desiredMcpSourceKey,
  mcpRegistryResolutionKey,
  mcpWorkspaceSourceKey,
} from "../../desired-state/index.js";
import {
  isPathSafe,
  makeWorkspaceRelativeSourcePath,
} from "@agentxm/extension-model/unstable/path-types";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import { RegistryClientFactory, stripFileProtocol } from "@agentxm/registry-client";
import {
  acceptedRegistryVersionForRef,
  validateExactResolvedVersion,
} from "../../desired-state/index.js";
import { appendWarningsToMessage } from "../../transitions/planning/index.js";
import type { JobStepResult, Operation } from "../../transitions/planning/index.js";
import {
  AcceptedResolutionWriter,
  DesiredStateReader,
  DesiredStateWriter,
  LockfileReader,
  SettingsReader,
  SettingsWriter,
  WorkspaceLocation,
} from "../../desired-state/index.js";
import { reusableCanonicalTree } from "../../materialization/index.js";
import { materializeRegistryPackage } from "../../materialization/index.js";
import { copyExtensionDirectory } from "../../acquisition/copy-directory.js";
import { replaceCanonicalDirectoryWithInspection } from "../../acquisition/canonical-directory.js";
import { computeExtensionPathsForLayout } from "../../desired-state/index.js";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import type {
  McpServerExtensionRef,
  RegistryMcpServerRef,
} from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { McpServerLockEntry } from "../../desired-state/index.js";
import {
  computeMaterializedTreeIntegrity,
  type MaterializedTreeInvalid,
  type TreeIntegrity,
} from "../../desired-state/index.js";
import { computePackageContentHash } from "../../desired-state/index.js";
import { mcpResolutionKey } from "../../desired-state/index.js";
import { buildExternalMcpServerLockEntry } from "../../mcp-connections/lock-entry-builder.js";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import {
  MCP_SERVER_MANIFEST_FILENAME,
  type McpRegistryKeyValueInput,
  type McpServerManifest,
  McpServerManifestSchema,
} from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import type { McpServerEntry } from "../../desired-state/index.js";
import {
  agentConfigTargets,
  mcpServerArtifact,
  mcpSettingsTarget,
  mcpSourceTarget,
} from "../../materialization/index.js";
import type { ExtensionManagerFailure } from "../../materialization/index.js";
import {
  McpAgentSyncRefused,
  McpCanonicalPathUnsafe,
  McpLocalNameConflict,
  McpRequiredInputsMissing,
  McpWorkspacePackageInvalid,
} from "../../materialization/index.js";
import {
  McpSecretStore,
  mcpSecretAccount,
  type McpSecretIdentity,
} from "../../materialization/index.js";

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
  source: { type: "registry", url: ref.source.location },
  identity: { owner: ref.owner, name: ref.name },
  resolved: {
    version: decodeVersionSync(ref.version),
    integrity: Option.getOrElse(ref.integrity, () => ""),
    publisherBindingId: ref.publisherBindingId,
  },
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

// -----------------------------------------------------------------------------
// Registry install
// -----------------------------------------------------------------------------

const installFromRegistry = (
  ref: RegistryMcpServerRef,
  reuse: { readonly force: boolean; readonly accepted: Option.Option<McpServerLockEntry> },
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const location = yield* WorkspaceLocation;
    const layout = yield* Ref.get(location.layout);

    const canonicalPath = computeExtensionPathsForLayout(
      path.join,
      layout,
      ref,
      "mcps",
      ref.name,
    ).canonicalPath;

    if (!isPathSafe(path, location.baseDir, canonicalPath)) {
      return yield* new McpCanonicalPathUnsafe({ serverName: ref.name, canonicalPath });
    }

    // Canonical observation decides whether the accepted tree is kept; an
    // edited tree is re-acquired so its drift never becomes accepted.
    const reusable = yield* reusableCanonicalTree({
      canonicalPath,
      requested: {
        refType: "registry",
        owner: ref.owner,
        name: ref.name,
        version: ref.version,
        publisherBindingId: ref.publisherBindingId,
      },
      accepted: reuse.accepted,
      force: reuse.force,
    });

    if (Option.isNone(reusable)) {
      yield* materializeRegistryPackage({
        baseDir: location.baseDir,
        destinationPath: canonicalPath,
        sourceLocation: ref.source.location,
        owner: ref.owner,
        type: "mcp-server",
        name: ref.name,
        version: ref.version,
        integrity: ref.integrity,
        publisherBindingId: ref.publisherBindingId,
        ...(ref.lifecycleWarnings === undefined
          ? {}
          : { lifecycleWarnings: ref.lifecycleWarnings }),
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
  | RegistryClientFactory
  | Path.Path
  | WorkspaceLocation
  | SettingsReader
  | SettingsWriter
  | LockfileReader
  | DesiredStateReader
  | DesiredStateWriter
  | AcceptedResolutionWriter
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
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const settingsWriter = yield* SettingsWriter;
    const lockfile = yield* LockfileReader;
    const desiredStateReader = yield* DesiredStateReader;
    const desiredStateWriter = yield* DesiredStateWriter;
    const accepted = yield* AcceptedResolutionWriter;
    const layout = yield* Ref.get(location.layout);
    const path = yield* Path.Path;
    const { ref } = op.args;
    const localName = op.args.declaration?.name ?? op.args.localName ?? ref.server.name;

    const strictAgentSync = Option.getOrElse(op.args.strictAgentSync ?? Option.none(), () => false);
    const env = Option.getOrElse(op.args.env ?? Option.none(), () => ({}));
    // A Registry ref that names no exact version can never be accepted, so it
    // is refused before anything is acquired or reused.
    if (ref.refType === "registry") {
      yield* validateExactResolvedVersion(
        `mcpServers.${ref.server.name}.resolvedVersion`,
        ref.version,
      );
    }
    const resolutionKey =
      ref.refType === "registry"
        ? mcpRegistryResolutionKey({
            authority: ref.source.location,
            owner: ref.owner,
            name: ref.server.name,
          })
        : undefined;
    const requestedSourceIdentity =
      resolutionKey ??
      (ref.refType === "workspace"
        ? mcpWorkspaceSourceKey(ref.owner, ref.server.name)
        : ref.refType === "local"
          ? Option.getOrElse(
              makeWorkspaceRelativeSourcePath(
                path,
                location.baseDir,
                stripFileProtocol(ref.location),
              ),
              () => ref.source.path,
            )
          : printSourceParams(ref.source));
    const desiredGraph = yield* desiredStateReader.graph();
    const existingLocalNode = desiredGraph.nodes.find(
      (node) => node.type === "mcp-server" && node.name === localName,
    );
    // A local source is one source however it is spelled: the connection
    // keeps the key the existing declaration already carries.
    const sourceIdentity =
      ref.refType === "local" &&
      existingLocalNode !== undefined &&
      existingLocalNode.identity.authority === "path" &&
      path.resolve(location.baseDir, existingLocalNode.identity.locator) ===
        path.resolve(stripFileProtocol(ref.location))
        ? desiredMcpSourceKey(existingLocalNode.identity)
        : requestedSourceIdentity;
    if (
      existingLocalNode !== undefined &&
      (existingLocalNode.authority === "inline" ||
        desiredMcpSourceKey(existingLocalNode.identity) !== sourceIdentity)
    ) {
      return yield* new McpLocalNameConflict({
        localName,
        requestedIdentity: sourceIdentity,
        owningIdentity:
          existingLocalNode.authority === "inline"
            ? "inline"
            : desiredMcpSourceKey(existingLocalNode.identity),
      });
    }
    const existingClosure = desiredGraph.mcpSourceClosures.find(
      (closure) => closure.key === sourceIdentity,
    );
    const acceptedEntry =
      ref.refType === "registry"
        ? yield* lockfile.entry("mcp-server", resolutionKey ?? "")
        : Option.none<McpServerLockEntry>();
    const lockedVersion =
      ref.refType === "registry" ? acceptedRegistryVersionForRef(acceptedEntry, ref) : undefined;
    const canonicalPath =
      ref.refType === "registry"
        ? yield* installFromRegistry(ref, { force: op.args.force, accepted: acceptedEntry })
        : ref.refType === "workspace"
          ? yield* Effect.gen(function* () {
              const fs = yield* FileSystem.FileSystem;
              const path = yield* Path.Path;
              const expectedPath = path.join(
                layout.scope === "project"
                  ? layout.authoredRoot("mcp-server")
                  : path.join(layout.acquiredRoot, ref.owner, "mcps"),
                ref.name,
              );
              if (
                ref.scope !== location.scope ||
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
            })
          : yield* Effect.scoped(
              Effect.gen(function* () {
                const destination = computeExtensionPathsForLayout(
                  path.join,
                  layout,
                  ref,
                  "mcps",
                  ref.name,
                ).canonicalPath;
                yield* replaceCanonicalDirectoryWithInspection<
                  TreeIntegrity,
                  McpWorkspacePackageInvalid | MaterializedTreeInvalid,
                  FileSystem.FileSystem | Path.Path
                >({
                  baseDir: location.baseDir,
                  canonicalPath: destination,
                  populate: (stagingPath) =>
                    copyExtensionDirectory(stripFileProtocol(ref.location), stagingPath).pipe(
                      Effect.mapError(
                        (cause) =>
                          new McpWorkspacePackageInvalid({
                            serverName: ref.server.name,
                            location: ref.location,
                            fault: "unreadable",
                            cause,
                          }),
                      ),
                    ),
                  inspect: computeMaterializedTreeIntegrity,
                });
                return destination;
              }),
            );
    const manifest = yield* readMcpServerManifest(canonicalPath);
    const resolvedVersion =
      ref.refType === "registry" || ref.refType === "workspace"
        ? ref.version
        : Option.match(manifest, { onNone: () => "0.0.0", onSome: (value) => value.version });
    const nothingRunnable = isNothingRunnableManifest(manifest);
    const secretNames = Option.match(manifest, {
      onNone: () => new Set<string>(),
      onSome: collectSecretInputNames,
    });

    const treeIntegrity = yield* computeMaterializedTreeIntegrity(canonicalPath);
    const lockEntry =
      ref.refType === "registry"
        ? buildLockEntry(ref, treeIntegrity)
        : ref.refType === "workspace"
          ? undefined
          : buildExternalMcpServerLockEntry({
              ref,
              treeIntegrity,
              contentIdentity: yield* computePackageContentHash(canonicalPath),
              localPath:
                ref.refType === "local"
                  ? makeWorkspaceRelativeSourcePath(
                      path,
                      location.baseDir,
                      stripFileProtocol(ref.location),
                    )
                  : Option.none(),
            });
    const currentMcpServers = yield* settings.entries("mcp-server");
    const currentEntry = currentMcpServers[localName];
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
        scope: location.scope,
        change,
        agents: agentOutcomes.map(({ agentId }) => agentId),
        targets: [
          ...(lockEntry === undefined ? [] : [mcpSourceTarget(location.scope, lockEntry, change)]),
          mcpSettingsTarget(location.scope, change),
          ...agentConfigTargets(agentOutcomes),
        ],
      }),
    } satisfies JobStepResult;
  });

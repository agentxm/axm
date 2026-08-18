/**
 * Install MCP server executor — orchestrates the per-server installation pipeline.
 *
 * Registry-only install: fetch archive, extract to canonical path, update lockfile/settings.
 * Simpler than skills — no agent symlinks.
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
import type { AgentId } from "../../agents/index.js";
import type { CodingAgent, McpServerSyncOutcome } from "../../agents/coding-agent.js";
import { CodingAgentRepository } from "../../agents/index.js";
import type { ConfigurableAgentId } from "../../agent-capabilities/index.js";
import { isPathSafe } from "../../utils/index.js";
import { isNonInteractiveOptional } from "../../cli-flags/index.js";
import { makeAppError, type AppError } from "../../app-error/index.js";
import type { Handle } from "../../extensions/handle.js";
import {
  acceptedRegistryVersionForRef,
  validateExactResolvedVersion,
} from "../../lockfile/index.js";
import { appendWarningsToMessage } from "../../plan/job-step-message.js";
import type { JobStepResult, Operation } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import {
  applyProjectionPlansWithResults,
  planSingletonProjection,
} from "../../projection/planning.js";
import {
  REGISTRY_EXTENSIONS_DIR,
  canReuseInstalledPackage,
  materializeRegistryPackage,
  registryCanonicalMaterializationIdentity,
} from "../../extensions/index.js";
import { printSourceParams } from "../../sources/index.js";
import type { McpServerExtensionRef, RegistryMcpServerRef } from "../refs.js";
import type { McpServerLockEntry } from "../../lockfile/index.js";
import { decodeVersionSync } from "../../version-constraints/version-constraints.js";
import {
  MCP_SERVER_MANIFEST_FILENAME,
  type McpRegistryArgument,
  type McpRegistryInput,
  type McpRegistryKeyValueInput,
  type McpServerManifest,
  McpServerManifestSchema,
} from "../manifest-schema.js";
import type { McpServerEntry } from "../../settings/index.js";
import { inspectAgentMcpServer } from "../inspection.js";
import { isMcpServerApplicableToAgent, sharedMcpTargetPolicyConflict } from "../targeting.js";
import {
  agentConfigTargets,
  mcpServerArtifact,
  mcpSettingsTarget,
  mcpSourceTarget,
} from "./artifact.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Args for the install-mcp-server operation.
 */
export type InstallMcpServerOperationArgs = {
  readonly ref: McpServerExtensionRef;
  readonly force: boolean;
  /** Explicitly permit a workspace-authored relocation during reconciliation. */
  readonly allowWorkspaceSourceTransition?: boolean;
  readonly versionRange: Option.Option<string>;
  /** When true, write to lockfile only (skip settings). Used for pack dependencies. */
  readonly skipSettings: Option.Option<boolean>;
  /** Materialize only; the enclosing authored-package transaction owns state writes. */
  readonly skipStateWrites?: boolean;
  /** When true, enforce strict policy for MCP sync outcomes. */
  readonly strictAgentSync?: Option.Option<boolean>;
  /** Resolved MCP input values from `--env KEY=VALUE` flags. */
  readonly env?: Option.Option<Readonly<Record<string, string>>>;
  /** Restrict this server to a reviewed subset of configured agents. */
  readonly agents?: ReadonlyArray<ConfigurableAgentId>;
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

const buildLockEntry = (ref: RegistryMcpServerRef): McpServerLockEntry => ({
  type: "registry",
  owner: ref.owner,
  name: ref.name,
  resolvedVersion: decodeVersionSync(ref.version),
  integrity: Option.getOrElse(ref.integrity, () => ""),
  sourceName: "default",
  publisherBindingId: ref.publisherBindingId,
});

const MCP_SECRET_SERVICE = "axm-mcp";

const mcpSecretAccount = (serverName: string, inputName: string): string =>
  `${serverName}:${inputName}`;

type KeyringEntry = {
  readonly getPassword: () => string | null;
  readonly setPassword: (password: string) => void;
};

type KeyringEntryConstructor = new (service: string, account: string) => KeyringEntry;

type KeyringModule = {
  readonly Entry: KeyringEntryConstructor;
};

const keyringModuleSpecifier = ["@napi-rs", "keyring"].join("/");

const loadKeyringEntry = Effect.tryPromise({
  try: async () => {
    const keyring: KeyringModule = await import(keyringModuleSpecifier);
    return keyring.Entry;
  },
  catch: () => undefined,
});

type McpSecretPersistenceOutcome =
  | { readonly _tag: "saved"; readonly inputName: string }
  | { readonly _tag: "skipped"; readonly inputName: string }
  | { readonly _tag: "failed"; readonly inputName: string };

const saveMcpSecret = (
  serverName: string,
  inputName: string,
  value: string,
): Effect.Effect<McpSecretPersistenceOutcome> =>
  Effect.gen(function* () {
    const Entry = yield* loadKeyringEntry;
    return yield* Effect.try({
      try: () => {
        const entry = new Entry(MCP_SECRET_SERVICE, mcpSecretAccount(serverName, inputName));
        entry.setPassword(value);
        return { _tag: "saved", inputName } satisfies McpSecretPersistenceOutcome;
      },
      catch: () => undefined,
    });
  }).pipe(
    Effect.catch(() =>
      Effect.succeed({ _tag: "failed", inputName } satisfies McpSecretPersistenceOutcome),
    ),
  );

const loadMcpSecret = (
  serverName: string,
  inputName: string,
): Effect.Effect<Option.Option<string>> =>
  Effect.gen(function* () {
    const Entry = yield* loadKeyringEntry;
    return yield* Effect.try({
      try: () => {
        const entry = new Entry(MCP_SECRET_SERVICE, mcpSecretAccount(serverName, inputName));
        return Option.fromNullOr(entry.getPassword());
      },
      catch: () => undefined,
    }).pipe(Effect.catch(() => Effect.succeed(Option.none())));
  }).pipe(Effect.catch(() => Effect.succeed(Option.none())));

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

const collectSecretInputNames = (manifest: McpServerManifest): ReadonlySet<string> => {
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

    const canonicalPath = path.join(
      ws.baseDir,
      REGISTRY_EXTENSIONS_DIR,
      ref.owner,
      "mcps",
      ref.name,
    );

    if (!isPathSafe(path, ws.baseDir, canonicalPath)) {
      return yield* makeAppError({
        code: "internal",
        detail: `Path traversal detected: ${canonicalPath}`,
      });
    }

    const identity = registryCanonicalMaterializationIdentity({
      owner: ref.owner,
      type: "mcp-server",
      name: ref.name,
      version: ref.version,
      publisherBindingId: ref.publisherBindingId,
      integrity: ref.integrity,
    });
    const useExisting = yield* canReuseInstalledPackage({
      installedPath: canonicalPath,
      force: reuse.force,
      identity,
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
        publisherBindingId: ref.publisherBindingId,
        messages: {
          integrityMismatchCode: "internal",
          integrityMismatchDetail: `Integrity mismatch for ${ref.name}@${ref.version}`,
        },
      });
    }

    return canonicalPath;
  });

const readManifest = (
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

const loadStoredMcpSecrets = (serverName: string, secretNames: ReadonlySet<string>) =>
  Effect.gen(function* () {
    const entries = yield* Effect.forEach(
      secretNames,
      (name) => loadMcpSecret(serverName, name).pipe(Effect.map((value) => ({ name, value }))),
      { concurrency: "unbounded" },
    );
    const loaded: Record<string, string> = {};
    for (const { name, value } of entries) {
      if (Option.isSome(value)) loaded[name] = value.value;
    }
    return loaded;
  });

const persistMcpSecrets = (
  serverName: string,
  secretNames: ReadonlySet<string>,
  values: Readonly<Record<string, string>>,
) =>
  Effect.forEach(
    secretNames,
    (name) => {
      const value = values[name];
      return value === undefined
        ? Effect.succeed({ _tag: "skipped", inputName: name } satisfies McpSecretPersistenceOutcome)
        : saveMcpSecret(serverName, name, value);
    },
    { concurrency: "unbounded" },
  );

const redactSettingsEnv = (
  values: Readonly<Record<string, string>>,
  secretNames: ReadonlySet<string>,
): Readonly<Record<string, string>> => {
  const redacted: Record<string, string> = {};
  for (const [name, value] of Object.entries(values)) {
    if (!secretNames.has(name)) redacted[name] = value;
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
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const warnings: Array<string> = [];

    const unknownConfiguredAgentIds = yield* agentRepo.getUnknownConfiguredAgentIds();
    if (args.strict && unknownConfiguredAgentIds.length > 0) {
      const message = `Unknown configured agents in strict mode: ${unknownConfiguredAgentIds.join(", ")}`;
      return yield* makeAppError({
        code: "not_found",
        detail: message,
      });
    }

    if (unknownConfiguredAgentIds.length > 0) {
      warnings.push(`Skipping unknown configured agents: ${unknownConfiguredAgentIds.join(", ")}`);
    }

    const configuredAgents = yield* agentRepo.getConfiguredAgents();
    const sharedTargetConflict = sharedMcpTargetPolicyConflict({
      entry: args.entry,
      agentIds: configuredAgents.map((agent) => agent.id),
      scope: args.scope,
    });
    if (sharedTargetConflict !== undefined) {
      return yield* makeAppError({ code: "conflict", detail: sharedTargetConflict });
    }

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
      outcomes = yield* applyProjectionPlansWithResults(
        configuredAgents.map((agent: CodingAgent) =>
          planSingletonProjection({
            unitId: "mcp-server:native-config-entry",
            targetFile: "mcp:configured-agents",
            contributor: args,
            adapter: {
              observe: () =>
                Effect.succeed({
                  unitId: "mcp-server:native-config-entry",
                  path: `${agent.id}:${args.serverName}`,
                  present: false,
                  current: false,
                  expectedContributors: [args.serverName],
                  observedContributors: [],
                }),
              apply: () =>
                Effect.gen(function* () {
                  if (!isMcpServerApplicableToAgent(args.entry, agent.id)) {
                    const inspection = yield* inspectAgentMcpServer({
                      workspaceRoot: args.wsBaseDir,
                      scope: args.scope,
                      agentId: agent.id,
                      serverName: args.serverName,
                      entry: args.entry,
                    });
                    if (inspection.status === "unmanaged") {
                      return yield* makeAppError({
                        code: "conflict",
                        detail: `${agent.id} has an unmanaged MCP server named ${args.serverName}; AXM will not remove it while applying the target policy`,
                      });
                    }
                    const outcome =
                      inspection.status === "drift"
                        ? yield* agent.removeMcpServer({
                            workspaceRoot: args.wsBaseDir,
                            scope: args.scope,
                            serverName: args.serverName,
                          })
                        : ({ _tag: "success", targets: [] } as const);
                    return { agentId: agent.id, outcome };
                  }
                  const outcome = yield* agent.addMcpServer({
                    workspaceRoot: args.wsBaseDir,
                    scope: args.scope,
                    serverName: args.serverName,
                    canonicalPath: args.canonicalPath,
                    owner: args.owner,
                    resolvedVersion: args.resolvedVersion,
                    enabled: args.enabled,
                    configValues: args.configValues,
                  });
                  return { agentId: agent.id, outcome };
                }).pipe(
                  Effect.provideService(FileSystem.FileSystem, fs),
                  Effect.provideService(Path.Path, path),
                ),
            },
          }),
        ),
      );
    }

    const misconfigured = Array.filter(outcomes, ({ outcome }) => outcome._tag === "misconfigured");
    if (misconfigured.length > 0) {
      return yield* makeAppError({
        code: "internal",
        detail: `MCP server ${args.serverName} could not be synced to configured agents`,
      });
    }

    const failed = Array.filter(outcomes, ({ outcome }) => outcome._tag === "failed");
    if (args.strict && failed.length > 0) {
      return yield* makeAppError({
        code: "internal",
        detail: `MCP server ${args.serverName} sync failed in strict mode`,
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
      return yield* makeAppError({
        code: "internal",
        detail: `MCP server ${args.serverName} sync disabled for required configured agents`,
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
 * Install-mcp-server operation handler.
 *
 * Registry-only: fetch archive, validate integrity, extract to canonical path,
 * then update lockfile/settings.
 */
export const installMcpServer: (
  op: InstallMcpServerOperation,
) => Effect.Effect<
  JobStepResult,
  AppError,
  | FileSystem.FileSystem
  | HttpClient.HttpClient
  | Path.Path
  | WorkspaceMutations
  | CodingAgentRepository
> = (op) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const { ref } = op.args;

    if (ref.refType !== "registry" && ref.refType !== "workspace") {
      return yield* makeAppError({
        code: "usage",
        detail: `MCP servers install from a registry or a workspace package, not from a ${ref.refType} source`,
        suggestions: [
          {
            description: "Install from the registry",
            cmd: `axm mcps install @owner/mcps/${ref.server.name}`,
          },
        ],
      });
    }

    const strictAgentSync = Option.getOrElse(op.args.strictAgentSync ?? Option.none(), () => false);
    const env = Option.getOrElse(op.args.env ?? Option.none(), () => ({}));
    const lockedVersion =
      ref.refType === "registry"
        ? acceptedRegistryVersionForRef(yield* ws.getLockedMcpServer(ref.server.name), ref)
        : undefined;
    const canonicalPath =
      ref.refType === "registry"
        ? yield* installFromRegistry(ref, { force: op.args.force, lockedVersion })
        : yield* Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const path = yield* Path.Path;
            const expectedPath = path.join(
              ws.baseDir,
              REGISTRY_EXTENSIONS_DIR,
              ref.owner,
              "mcps",
              ref.name,
            );
            if (
              ref.scope !== ws.scope ||
              path.resolve(ref.location) !== path.resolve(expectedPath)
            ) {
              return yield* makeAppError({
                code: "validation",
                detail: `Invalid workspace MCP server source location: ${ref.location}`,
              });
            }
            const exists = yield* fs.exists(ref.location).pipe(
              Effect.mapError((error) =>
                makeAppError({
                  code: "internal",
                  detail: `Failed to inspect workspace MCP server package: ${ref.location}`,
                  cause: error,
                }),
              ),
            );
            if (!exists) {
              return yield* makeAppError({
                code: "validation",
                detail: `Workspace MCP server package is missing: ${ref.location}`,
              });
            }
            return ref.location;
          });
    const manifest = yield* readManifest(canonicalPath);
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

    const lockEntry = ref.refType === "registry" ? buildLockEntry(ref) : undefined;
    const currentMcpServers = yield* ws.getConfiguredMcpServerEntries();
    const currentEntry = currentMcpServers[ref.server.name];
    const storedSecrets = yield* loadStoredMcpSecrets(ref.server.name, secretNames);
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
    if (missingInputs.length > 0 && (yield* isNonInteractiveOptional)) {
      return yield* makeAppError({
        code: "usage",
        detail: `${ref.server.name} needs ${missingInputs.join(", ")}, and --non-interactive cannot prompt for them`,
        suggestions: [
          {
            description: "Supply each required input on the command line",
            cmd: missingInputs.map((name) => `--env ${name}=<value>`).join(" "),
          },
        ],
      });
    }
    const persistedEnv = redactSettingsEnv(mergedEnv, secretNames);
    const enabled = currentEntry?.enabled ?? true;
    const agents = op.args.agents ?? currentEntry?.agents;
    const settingsEntry: McpServerEntry = {
      source: printSourceParams(ref.source),
      env: persistedEnv,
      enabled,
      ...(agents === undefined ? {} : { agents }),
    };
    const agentSync = yield* syncConfiguredAgentsOnInstall({
      wsBaseDir: ws.baseDir,
      scope: ws.scope,
      strict: strictAgentSync,
      serverName: ref.server.name,
      canonicalPath,
      owner: ref.owner,
      resolvedVersion: ref.version,
      nothingRunnable,
      enabled,
      configValues: preserveSecretReferences(mergedEnv, secretNames),
      entry: settingsEntry,
    });

    const secretPersistence = yield* persistMcpSecrets(ref.server.name, secretNames, mergedEnv);
    const secretWarnings = secretPersistence.flatMap((outcome) =>
      outcome._tag === "failed"
        ? [`${outcome.inputName} could not be saved to the system keychain`]
        : [],
    );
    const writeEffect =
      op.args.skipStateWrites === true
        ? Effect.void
        : Option.getOrElse(op.args.skipSettings, () => false)
          ? lockEntry === undefined
            ? Effect.void
            : ws.setMcpServerLock({
                name: ref.server.name,
                lockEntry,
                versionRange: Option.none(),
              })
          : lockEntry === undefined
            ? ws.setMcpServerEntry(ref.server.name, {
                ...settingsEntry,
              })
            : ws.setMcpServer({
                name: ref.server.name,
                lockEntry,
                versionRange: op.args.versionRange,
                env: persistedEnv,
                enabled,
                ...(agents === undefined ? {} : { agents }),
              });
    const writeWarning = yield* writeEffect.pipe(
      Effect.as(Option.none<string>()),
      Effect.catch((e) => Effect.succeed(Option.some(`MCP server update failed: ${e.detail}`))),
    );

    const warnings = Option.match(writeWarning, {
      onNone: () => [...secretWarnings, ...agentSync.warnings],
      onSome: (warning) => [warning, ...secretWarnings, ...agentSync.warnings],
    });
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
        `Installed ${ref.server.name} (canonical=success, agent-sync=${agentSync.status})`,
        warnings,
      ),
      artifact: mcpServerArtifact({
        lockEntry,
        scope: ws.scope,
        change,
        agents: agentOutcomes.map(({ agentId }) => agentId),
        targets: [
          ...(lockEntry === undefined ? [] : [mcpSourceTarget(lockEntry, change)]),
          mcpSettingsTarget(change),
          ...agentConfigTargets(agentOutcomes),
        ],
      }),
    } satisfies JobStepResult;
  });

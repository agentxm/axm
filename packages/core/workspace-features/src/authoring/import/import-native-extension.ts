import {
  isMcpCredentialName,
  type McpAuth,
  type McpValue,
} from "@agentxm/workspace-kernel/agent-adapters";
import type { AuthoredMcpPreferences } from "../authored-declaration.js";
import {
  prepareExecutionCandidate,
  resolveExecutionCandidate,
  type ExecutionCandidate,
} from "@agentxm/workspace-kernel/planning";
/**
 * Importing native, unmanaged content as an authored AXM package.
 *
 * Three routes share one decision: a native skill directory or file, a native
 * subagent document, and a native MCP connection declared in an agent's own
 * config all become a workspace-authored package with the requested package
 * identity. Subagents keep their native runtime identity inside an explicit
 * implementation slot. The
 * native source is never modified — except for an MCP connection, whose native
 * declaration is retired only after the managed package validates, because
 * leaving both would give one connection two owners.
 *
 * `prepare` settles the identity, the destination, and the activation, and
 * stages the converted package into a scoped temporary directory; nothing
 * under the workspace is written. `previewOrApply` resolves that candidate.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type * as Scope from "effect/Scope";
import type { RegistryClientFactory } from "@agentxm/registry-client";

import {
  SkillManager,
  SubagentManager,
  McpServerManager,
  HookManager,
  type ExtensionManagerFailure,
  type ManagerRequirements,
  type AuthorMaterialization,
} from "@agentxm/workspace-kernel/materialization";
import {
  NativeWriteAuthority,
  retireAgentMcpConfig,
  type AgentMcpConfigEntryRef,
} from "@agentxm/workspace-kernel/agent-adapters";
import { materializeAuthoredMcpServer } from "@agentxm/extension-kinds/mcp-connections";
import {
  buildAuthoredExtensionStep,
  type AuthoredExtensionOperationArgs,
  type RecipeRequirements,
} from "@agentxm/workspace-kernel/reconciliation";
import {
  extensionTypeToPlural,
  formatFqn,
  parseFqn,
  type ExtensionFqnParts,
  type ExtensionName,
  type FqnInvalidError,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { AgentId } from "@agentxm/extension-model/unstable/agent-capabilities/identity";
import {
  MCP_SERVER_MANIFEST_FILENAME,
  MCP_SERVER_MANIFEST_SCHEMA_URL,
  MCP_SERVER_REGISTRY_SERVER_SCHEMA_URL,
  type McpServerManifest,
} from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import {
  decodeVersionSync,
  type Version,
} from "@agentxm/extension-model/unstable/version-constraints";
import {
  SourceHostProviders,
  WorkspaceCatalog,
  acquireExternalSource,
  resolveSource,
  type SourceResolutionFailure,
} from "@agentxm/workspace-kernel/sources";
import {
  operationPresentation,
  type CandidateFingerprintFailed,
  type JobStepArtifact,
  type JobStepArtifactTarget,
  type Plan,
  type PlanExecution,
  type PlannedJobStep,
} from "@agentxm/workspace-kernel/operations";
import type { CodingAgentRepository } from "@agentxm/workspace-kernel/projection";
import {
  AcceptedResolutionWriter,
  DesiredStateWriter,
  SettingsWriter,
  type ConfiguredAgentOutcomesProvider,
  computePackageContentHash,
  type LockfileReader,
  type LockfileValidationError,
  type PackageContentHashFailed,
  SettingsReader,
  WorkspaceLocation,
  type WorkspaceLockfileReadFailure,
  WorkspaceRecords,
  type WorkspaceSettingsReadFailure,
} from "@agentxm/workspace-kernel/workspace-state";

import { authoredDeclaration } from "../authored-declaration.js";
import type { AuthoredPackageError } from "../authored-package-errors.js";
import { preflightCreateOnly } from "../create-preflight.js";
import { AuthoringFailed } from "../errors.js";
import { requireAuthoredOwner, settingsRelativePath } from "../create/authoring-owner.js";
import {
  AuthoringScopeUnsupported,
  type AuthoringOwnerMismatch,
  type AuthoringOwnerRequired,
} from "../create/errors.js";
import { importNativeExtensionPackage } from "../import-native-package.js";
import {
  preflightAuthoredSubagentProjection,
  type AuthoredNativeProjection,
} from "../native-projection.js";
import { authoringStepFailure, type AuthoringStepFailure } from "../step-failure.js";
import { readExtensionManifest } from "@agentxm/extension-content";
import {
  copyExtensionDirectory,
  createCanonicalDirectory,
  recoverCanonicalDirectory,
  replaceCanonicalDirectory,
} from "@agentxm/workspace-kernel/acquisition";
import type { ConfigurableAgentId } from "@agentxm/extension-model/unstable/agent-capabilities/identity";
import { prepareNativeHookImport, writeNativeHookImport } from "../hooks/interchange.js";

/** The version an imported package starts at. */
const INITIAL_IMPORT_VERSION = decodeVersionSync("0.1.0");

// -----------------------------------------------------------------------------
// Request
// -----------------------------------------------------------------------------

/** The extension types native content can be imported as. */
export type NativeImportType = "skill" | "subagent" | "mcp-server" | "hook";

interface ImportRequestBase {
  /** Owner-qualified identity the imported package will carry. */
  readonly target: string;
  /** Materialize the import immediately instead of leaving it declared and inert. */
  readonly enable: boolean;
}

export interface ImportNativeSkillRequest extends ImportRequestBase {
  readonly type: "skill";
  /** Local or Git native source, as the person typed it. */
  readonly source: string;
}

export interface ImportNativeSubagentRequest extends ImportRequestBase {
  readonly type: "subagent";
  readonly source: string;
  readonly sourceAgent?: AgentId;
}

export interface ImportNativeHookRequest {
  readonly type: "hook";
  readonly target: string;
  readonly source: string;
  readonly protocol: ConfigurableAgentId;
  readonly configPath?: string;
  readonly resources?: ReadonlyArray<string>;
  readonly enable: false;
}

/** One native MCP connection the workspace discovered, in package terms. */
export interface NativeMcpCandidate {
  /** The native connection key. */
  readonly name: string;
  /**
   * The remote form the connection has, or none when it is a local command
   * that no package manifest can represent losslessly.
   */
  readonly remote: Option.Option<{
    readonly transport: "streamable-http" | "sse";
    readonly url: McpValue;
    readonly headers: Readonly<Record<string, McpValue>>;
  }>;
  readonly auth?: McpAuth;
  /** Every native declaration of this connection, across agent config files. */
  readonly entries: ReadonlyArray<AgentMcpConfigEntryRef>;
}

/** What the workspace discovered about its unmanaged native MCP connections. */
export interface NativeMcpDiscovery {
  readonly candidates: ReadonlyArray<NativeMcpCandidate>;
  /** Connection keys whose native declarations disagree across agents. */
  readonly conflicts: ReadonlyArray<string>;
}

export interface ImportNativeMcpServerRequest extends ImportRequestBase {
  readonly type: "mcp-server";
  readonly discovery: NativeMcpDiscovery;
  /**
   * Whether the invoking surface can prompt for a connection input the
   * converted manifest requires.
   */
  readonly nonInteractive: boolean;
}

/** What a person asked to import. */
export type ImportNativeExtensionRequest =
  | ImportNativeSkillRequest
  | ImportNativeSubagentRequest
  | ImportNativeMcpServerRequest
  | ImportNativeHookRequest;

// -----------------------------------------------------------------------------
// Candidate
// -----------------------------------------------------------------------------

/** What every step in a native import may require when it runs. */
export type ImportNativeExtensionRequirements =
  | SubagentManager
  | ManagerRequirements
  | RecipeRequirements
  | McpServerManager
  | HookManager
  | AcceptedResolutionWriter
  | DesiredStateWriter
  | SettingsReader
  | SettingsWriter
  | WorkspaceLocation
  | LockfileReader
  | SettingsReader
  | WorkspaceLocation
  | WorkspaceRecords
  | CodingAgentRepository;

/** A settled import: every decision is made and nothing under the workspace is written. */
export interface ImportNativeExtensionCandidate {
  readonly type: NativeImportType;
  readonly fqn: string;
  readonly owner: Handle;
  readonly name: string;
  /** Where the native content came from, in operator-facing terms. */
  readonly origin: string;
  /** Workspace-relative directory the package will occupy. */
  readonly authoredPath: string;
  /** Workspace-relative settings file the declaration is written to. */
  readonly settingsPath: string;
  /** Whether the import is materialized once it is declared. */
  readonly enabled: boolean;
  readonly execution: ExecutionCandidate<ImportNativeExtensionRequirements>;
}

/** Every failure settling a native import can surface before anything is written. */
export type ImportNativeExtensionFailure =
  | AuthoringFailed
  | ExtensionManagerFailure
  | AuthoredPackageError
  | AuthoringOwnerRequired
  | AuthoringOwnerMismatch
  | AuthoringScopeUnsupported
  | SourceResolutionFailure
  | PackageContentHashFailed
  | LockfileValidationError
  | WorkspaceLockfileReadFailure
  | WorkspaceSettingsReadFailure
  | CandidateFingerprintFailed
  | FqnInvalidError;

/** Everything settling a native import reads before it freezes a candidate. */
export type PrepareImportNativeExtensionRequirements =
  | ManagerRequirements
  | FileSystem.FileSystem
  | Path.Path
  | Scope.Scope
  | RegistryClientFactory
  | AcceptedResolutionWriter
  | DesiredStateWriter
  | SettingsReader
  | SettingsWriter
  | WorkspaceLocation
  | LockfileReader
  | SettingsReader
  | WorkspaceLocation
  | WorkspaceRecords
  | SkillManager
  | SubagentManager
  | McpServerManager
  | HookManager
  | SourceHostProviders
  | WorkspaceCatalog
  | ConfiguredAgentOutcomesProvider;

/** Build the import step with the requirements this use case keeps in `R`. */
const importStep = <TRef extends ExtensionRef, TFacts>(
  manager: AuthorMaterialization<TRef, TFacts, ExtensionManagerFailure, ManagerRequirements>,
  args: AuthoredExtensionOperationArgs<
    TRef,
    TFacts,
    AuthoringStepFailure,
    ImportNativeExtensionRequirements
  >,
): PlannedJobStep<ImportNativeExtensionRequirements | RecipeRequirements> =>
  buildAuthoredExtensionStep<TRef, TFacts, AuthoringStepFailure, ImportNativeExtensionRequirements>(
    manager,
    args,
  );

/** The plan a native import resolves. */
export const importNativeExtensionPlanName = (type: NativeImportType): string =>
  type === "mcp-server" ? "Import MCP server package" : "Import native extension";

/**
 * The one connection a package conversion may represent.
 *
 * Converting requires an unambiguous subject: a config the agents disagree
 * about, a discovery that found no connection or several, and a local command
 * that no manifest can express are three different refusals, each recoverable
 * in a different way.
 */
const selectNativeMcpCandidate = (
  discovery: NativeMcpDiscovery,
): Effect.Effect<
  {
    readonly candidate: NativeMcpCandidate;
    readonly transport: "streamable-http" | "sse";
    readonly url: string;
    readonly headers: Readonly<Record<string, McpValue>>;
  },
  AuthoringFailed
> => {
  if (discovery.conflicts.length > 0) {
    return Effect.fail(
      new AuthoringFailed({
        category: "conflict",
        detail: `MCP package import has ${discovery.conflicts.length} conflicted native candidate(s)`,
      }),
    );
  }
  const candidate = discovery.candidates[0];
  if (candidate === undefined || discovery.candidates.length !== 1) {
    return Effect.fail(
      new AuthoringFailed({
        category: "validation",
        detail:
          discovery.candidates.length === 0
            ? "No losslessly importable unmanaged MCP server was found"
            : "MCP package import requires exactly one unmanaged server candidate",
      }),
    );
  }
  if (Option.isNone(candidate.remote)) {
    return Effect.fail(
      new AuthoringFailed({
        category: "usage",
        detail:
          "This MCP command cannot be represented losslessly as a managed package; import it inline without --as",
      }),
    );
  }
  if (typeof candidate.remote.value.url !== "string")
    return Effect.fail(
      new AuthoringFailed({
        category: "usage",
        detail:
          "A local symbolic endpoint cannot be published as a fixed remote; retain this connection inline",
      }),
    );
  return Effect.succeed({
    candidate,
    transport: candidate.remote.value.transport,
    url: candidate.remote.value.url,
    headers: candidate.remote.value.headers,
  });
};

/** The manifest a converted native connection is published as. */
const convertedMcpManifest = (args: {
  readonly owner: Handle;
  readonly name: ExtensionName;
  readonly nativeName: string;
  readonly transport: "streamable-http" | "sse";
  readonly url: string;
  readonly headers: Readonly<Record<string, McpValue>>;
}): McpServerManifest => ({
  $schema: MCP_SERVER_MANIFEST_SCHEMA_URL,
  owner: args.owner,
  type: "mcp-server",
  name: args.name,
  version: INITIAL_IMPORT_VERSION,
  description: `Imported MCP server ${args.nativeName}`,
  server: {
    $schema: MCP_SERVER_REGISTRY_SERVER_SCHEMA_URL,
    name: `local.axm/${args.name}`,
    description: `Imported MCP server ${args.nativeName}`,
    version: INITIAL_IMPORT_VERSION,
    remotes: [
      {
        type: args.transport,
        url: args.url,
        ...(Object.keys(args.headers).length === 0
          ? {}
          : {
              headers: Object.keys(args.headers).map((name) => ({
                name,
                isRequired: true,
                isSecret: isMcpCredentialName(name),
              })),
            }),
      },
    ],
  },
});

// -----------------------------------------------------------------------------
// Conversions
// -----------------------------------------------------------------------------

/**
 * What one conversion settled: where the content came from, how the package
 * body is staged, and what native declaration the conversion retires.
 */
interface SettledConversion {
  /** Where the native content came from, in operator-facing terms. */
  readonly origin: string;
  /** Connection inputs the converted declaration carries. */
  readonly mcpPreferences: AuthoredMcpPreferences;
  /** Native files the conversion may rewrite, protected by the transaction. */
  readonly nativeTargets: ReadonlyArray<string>;
  /** Files the staged package must contain before it is published. */
  readonly requiredFiles: ReadonlyArray<string> | undefined;
  readonly stagedPackage?: string;
  readonly version?: Version;
  readonly materialPaths: ReadonlyArray<string>;
  readonly populate: (
    stagingPath: string,
  ) => Effect.Effect<void, AuthoringStepFailure, FileSystem.FileSystem | Path.Path>;
  readonly validate:
    | ((
        publicationPath: string,
      ) => Effect.Effect<void, AuthoringStepFailure, FileSystem.FileSystem | Path.Path>)
    | undefined;
  /** Retire the native declaration the managed package replaced. */
  readonly retireNative: Effect.Effect<
    void,
    AuthoringStepFailure,
    FileSystem.FileSystem | Path.Path | NativeWriteAuthority
  >;
}

/**
 * Convert a native skill or subagent by staging the complete package now and
 * pinning its content hash, so content that changes between preview and apply
 * refuses instead of landing.
 */
const nativeConversion = Effect.fn("ImportNativeExtension.nativeConversion")(function* (args: {
  readonly request: ImportNativeSkillRequest | ImportNativeSubagentRequest;
  readonly target: ExtensionFqnParts;
  readonly existingPackagePath?: string;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const source = yield* resolveSource(args.request.source);
  const acquired = yield* acquireExternalSource(source);
  const stagingRoot = yield* fs.makeTempDirectoryScoped({ prefix: "axm-import-" }).pipe(
    Effect.mapError(
      (cause) =>
        new AuthoringFailed({
          category: "internal",
          detail: "Import staging directory could not be created",
          cause,
        }),
    ),
  );
  const stagedPackage = path.join(stagingRoot, "package");
  yield* importNativeExtensionPackage({
    sourcePath: acquired.directory,
    targetDir: stagedPackage,
    target: args.target,
    ...(args.request.type === "subagent" && args.request.sourceAgent !== undefined
      ? { sourceAgent: args.request.sourceAgent }
      : {}),
    ...(args.existingPackagePath === undefined
      ? {}
      : { existingPackagePath: args.existingPackagePath }),
  });
  const stagedHash = yield* computePackageContentHash(stagedPackage);
  const converted = yield* readExtensionManifest(stagedPackage, args.target.type).pipe(
    Effect.mapError(
      (cause) =>
        new AuthoringFailed({
          category: "validation",
          detail: "Converted package manifest is invalid",
          cause,
        }),
    ),
  );
  return {
    origin: acquired.origin,
    mcpPreferences: {},
    nativeTargets: [],
    requiredFiles: undefined,
    stagedPackage,
    version: converted.manifest.version,
    materialPaths: [acquired.directory, stagedPackage],
    populate: (publicationPath: string) =>
      copyExtensionDirectory(stagedPackage, publicationPath).pipe(
        Effect.mapError(
          (cause) =>
            new AuthoringFailed({
              category: "internal",
              detail: "Prepared import could not be staged",
              cause,
            }),
        ),
      ),
    validate: (publicationPath: string) =>
      computePackageContentHash(publicationPath).pipe(
        Effect.flatMap((currentHash) =>
          currentHash === stagedHash
            ? Effect.void
            : new AuthoringFailed({
                category: "conflict",
                detail: "Prepared import content changed before it could be applied",
              }),
        ),
      ),
    retireNative: Effect.void,
  } satisfies SettledConversion;
});

/**
 * Convert one discovered native MCP connection into a manifest, and retire
 * every native declaration of it once the managed package validates.
 */
const mcpConversion = Effect.fn("ImportNativeExtension.mcpConversion")(function* (args: {
  readonly request: ImportNativeMcpServerRequest;
  readonly owner: Handle;
  readonly name: ExtensionName;
  readonly workspaceRoot: string;
}) {
  const { candidate, transport, url, headers } = yield* selectNativeMcpCandidate(
    args.request.discovery,
  );
  const manifest = convertedMcpManifest({
    owner: args.owner,
    name: args.name,
    nativeName: candidate.name,
    transport,
    url,
    headers,
  });
  const entries = [...candidate.entries].sort((left, right) =>
    left.filePath === right.filePath
      ? left.name.localeCompare(right.name)
      : left.filePath.localeCompare(right.filePath),
  );
  return {
    origin: candidate.name,
    mcpPreferences: {
      distribution: { kind: "remote", transport, url },
      bindings: Object.entries(headers).map(([name, value]) => ({
        target: { kind: "header", name },
        value,
      })),
      ...(candidate.auth === undefined ? {} : { auth: candidate.auth }),
    },
    nativeTargets: Array.from(new Set(entries.map((entry) => entry.filePath))).sort(),
    requiredFiles: [MCP_SERVER_MANIFEST_FILENAME],
    materialPaths: [],
    populate: (stagingPath: string) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs
          .writeFileString(
            path.join(stagingPath, MCP_SERVER_MANIFEST_FILENAME),
            `${JSON.stringify(manifest, null, 2)}\n`,
          )
          .pipe(
            Effect.mapError(
              (cause) =>
                new AuthoringFailed({
                  category: "internal",
                  detail: "MCP package manifest could not be staged",
                  cause,
                }),
            ),
          );
      }),
    validate: undefined,
    retireNative: Effect.forEach(
      entries,
      (entry) =>
        retireAgentMcpConfig({
          workspaceRoot: args.workspaceRoot,
          serverName: entry.name,
          serversPath: entry.serversPath,
          target: entry.target,
          adoption: { filePath: entry.filePath, expectedEntry: entry.expectedEntry },
        }),
      { discard: true },
    ),
  } satisfies SettledConversion;
});

const hookConversion = Effect.fn("ImportNativeExtension.hookConversion")(function* (
  request: ImportNativeHookRequest,
  target: ExtensionFqnParts,
) {
  const bundle = yield* prepareNativeHookImport({
    source: request.source,
    target,
    protocol: request.protocol,
    ...(request.configPath === undefined ? {} : { configPath: request.configPath }),
    ...(request.resources === undefined ? {} : { resources: request.resources }),
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof AuthoringFailed
        ? cause
        : new AuthoringFailed({
            category: "validation",
            detail: "Native Hook bundle could not be read",
            cause,
          }),
    ),
  );
  return {
    origin: request.source,
    mcpPreferences: {},
    materialPaths: [],
    nativeTargets: [],
    requiredFiles: ["hook.json", ...bundle.files.map((file) => file.path)],
    populate: (publicationPath: string) =>
      writeNativeHookImport(publicationPath, bundle).pipe(
        Effect.mapError(
          (cause) =>
            new AuthoringFailed({
              category: "internal",
              detail: "Native Hook import could not be staged",
              cause,
            }),
        ),
      ),
    validate: undefined,
    retireNative: Effect.void,
  } satisfies SettledConversion;
});

// -----------------------------------------------------------------------------
// prepare
// -----------------------------------------------------------------------------

/** Settle a native import and stage its converted content, writing nothing. */
export const prepareImportNativeExtension: (
  request: ImportNativeExtensionRequest,
) => Effect.Effect<
  ImportNativeExtensionCandidate,
  ImportNativeExtensionFailure,
  PrepareImportNativeExtensionRequirements
> = Effect.fn("ImportNativeExtension.prepare")(function* (request) {
  const location = yield* WorkspaceLocation;
  const layout = yield* Ref.get(location.layout);
  const settings = yield* SettingsReader;
  const settingsWriter = yield* SettingsWriter;
  const accepted = yield* AcceptedResolutionWriter;
  const desiredStateWriter = yield* DesiredStateWriter;
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;

  const target = yield* Effect.fromResult(parseFqn(request.target));
  if (target.type !== request.type) {
    return yield* new AuthoringFailed({
      category: "validation",
      detail: `Expected a ${extensionTypeToPlural[request.type]} target FQN, got ${request.target}`,
    });
  }
  yield* requireAuthoredOwner(target.owner, { subject: "package", command: "import" });
  if (layout.scope !== "project") {
    return yield* new AuthoringScopeUnsupported({ subject: "import", scope: layout.scope });
  }

  const name = target.name;
  const fqn = formatFqn(target);
  const targetDir = path.join(layout.authoredRoot(target.type), name);
  const authoredPath = path.relative(location.baseDir, targetDir);
  const settingsPath = settingsRelativePath(path, location, layout);
  const subject = request.type === "mcp-server" ? "MCP package" : "Import target";

  const createOnly = preflightCreateOnly({
    subject,
    name,
    configured: false,
    destinations: [targetDir],
  });
  const declaration = authoredDeclaration(
    { settings, settingsWriter, accepted, desiredStateWriter },
    target.type,
    name,
    { roundTrip: false },
  );
  const current = yield* declaration.read;
  const targetExists = yield* fs.exists(targetDir).pipe(
    Effect.mapError(
      (cause) =>
        new AuthoringFailed({
          category: "internal",
          detail: "Import target could not be inspected",
          cause,
        }),
    ),
  );
  const updateExisting = request.type === "subagent" && targetExists;
  if (
    request.type === "subagent" &&
    current.configured &&
    Option.getOrUndefined(current.source) !== "workspace"
  ) {
    return yield* new AuthoringFailed({
      category: "conflict",
      detail: "Native import cannot replace a non-authored subagent; fork or adopt it first",
    });
  }
  if (updateExisting && !current.configured) {
    return yield* new AuthoringFailed({
      category: "conflict",
      detail:
        "An existing subagent directory must be declared as workspace-authored before importing a runtime implementation",
    });
  }
  if (!updateExisting) yield* createOnly;
  const expectedTargetHash = updateExisting
    ? yield* computePackageContentHash(targetDir)
    : undefined;
  const targetPreflight = Effect.gen(function* () {
    if (expectedTargetHash === undefined) return yield* createOnly;
    const observed = yield* computePackageContentHash(targetDir);
    if (observed !== expectedTargetHash)
      return yield* new AuthoringFailed({
        category: "conflict",
        detail: "Authored subagent changed after import preparation",
      });
    const latest = yield* declaration.read;
    if (
      Option.getOrUndefined(latest.source) !== "workspace" ||
      Option.getOrUndefined(latest.enabled) !== Option.getOrUndefined(current.enabled)
    ) {
      return yield* new AuthoringFailed({
        category: "conflict",
        detail: "Authored subagent declaration changed after import preparation",
      });
    }
  });

  const settled: SettledConversion =
    request.type === "mcp-server"
      ? yield* mcpConversion({
          request,
          owner: target.owner,
          name,
          workspaceRoot: location.baseDir,
        })
      : request.type === "hook"
        ? yield* hookConversion(request, target)
        : yield* nativeConversion({
            request,
            target,
            ...(updateExisting ? { existingPackagePath: targetDir } : {}),
          });

  const enabled =
    request.type === "hook"
      ? false
      : request.type === "mcp-server" || (request.type === "subagent" && !updateExisting)
        ? request.enable
        : request.enable || Option.getOrElse(current.enabled, () => false);
  const mcpPreferences =
    request.type === "mcp-server" ? settled.mcpPreferences : current.mcpPreferences;
  const nativePreflight =
    request.type === "subagent" && settled.stagedPackage !== undefined
      ? preflightAuthoredSubagentProjection({
          identity: target,
          packageRoot: settled.stagedPackage,
          enabled,
        })
      : Effect.succeed<AuthoredNativeProjection>({});
  const nativeProjection = yield* nativePreflight;

  const artifact: JobStepArtifact = {
    ...nativeProjection,
    path: authoredPath,
    scope: location.scope,
    version: settled.version ?? INITIAL_IMPORT_VERSION,
    change: updateExisting ? "updated" : "created",
    targets: [
      { path: authoredPath, change: updateExisting ? "updated" : "created" },
      { path: settingsPath, change: "created" },
      ...(nativeProjection.targets ?? []),
      ...settled.nativeTargets.map(
        (filePath) =>
          ({
            path: path.relative(location.baseDir, filePath),
            change: "updated",
          }) satisfies JobStepArtifactTarget,
      ),
    ],
  };

  const common = {
    toStepFailure: authoringStepFailure,
    location: targetDir,
    ...(settled.nativeTargets.length === 0 ? {} : { transactionTargets: settled.nativeTargets }),
    versionRange: Option.none<string>(),
    label: `Import ${settled.origin} -> ${fqn}`,
    message:
      request.type === "hook"
        ? `Imported ${fqn} inactive. Original registrations remain; enabling this package may execute the same hook twice.`
        : `Imported ${fqn}`,
    enabled,
    nativeInsertionEligible: false,
    allowConfiguredSourceTransition: request.type !== "subagent",
    markAuthored: declaration.declare({ enabled: true, mcpPreferences }),
    finalizeAuthored: declaration.declare({ enabled, mcpPreferences }).pipe(Effect.asVoid),
    plannedArtifact: artifact,
    buildArtifact: () => Effect.succeed(artifact),
    preflight: Effect.gen(function* () {
      yield* recoverCanonicalDirectory({ baseDir: location.baseDir, canonicalPath: targetDir });
      yield* targetPreflight;
      yield* nativePreflight;
    }),
    scaffold: (updateExisting
      ? replaceCanonicalDirectory<AuthoringStepFailure, FileSystem.FileSystem | Path.Path>({
          baseDir: location.baseDir,
          canonicalPath: targetDir,
          populate: settled.populate,
          ...(settled.validate === undefined ? {} : { validate: settled.validate }),
        })
      : createCanonicalDirectory<AuthoringStepFailure, FileSystem.FileSystem | Path.Path>({
          baseDir: location.baseDir,
          canonicalPath: targetDir,
          subject,
          ...(settled.requiredFiles === undefined ? {} : { requiredFiles: settled.requiredFiles }),
          populate: settled.populate,
          ...(settled.validate === undefined ? {} : { validate: settled.validate }),
        })
    ).pipe(Effect.andThen(settled.retireNative), Effect.asVoid),
  } as const;

  const step = yield* Effect.gen(function* () {
    switch (request.type) {
      case "skill":
        return importStep(yield* SkillManager, { ...common, target: { type: "skill", name } });
      case "subagent":
        return importStep(yield* SubagentManager, {
          ...common,
          target: { type: "subagent", name },
          buildArtifact: ({ change, materialization }) =>
            Effect.succeed({
              ...artifact,
              ...(Option.isNone(materialization)
                ? {}
                : {
                    agentOutcomes: materialization.value.observation.agentOutcomes ?? [],
                    nativeLocations: materialization.value.observation.nativeLocations ?? [],
                    agents: materialization.value.observation.agents,
                    targets: [
                      ...(artifact.targets ?? []).filter(
                        (target) =>
                          !materialization.value.observation.targets.some(
                            (native) =>
                              path.resolve(location.baseDir, native.path) ===
                              path.resolve(location.baseDir, target.path),
                          ),
                      ),
                      ...materialization.value.observation.targets.map((target) => ({
                        ...target,
                        change,
                      })),
                    ],
                  }),
            }),
        });
      case "mcp-server":
        return importStep(yield* McpServerManager, {
          ...common,
          target: { type: "mcp-server", name },
          materializeWhenDisabled: true,
          materializeInstall: (ref, options) =>
            materializeAuthoredMcpServer({
              ref,
              nonInteractive: request.nonInteractive,
              nativeInsertionEligible: options.nativeInsertionEligible,
            }),
          buildArtifact: ({ materialization }) =>
            Effect.succeed({
              ...artifact,
              nativeLocations: Option.isSome(materialization)
                ? (materialization.value.observation.nativeLocations ?? [])
                : [],
              agents: Option.isSome(materialization)
                ? materialization.value.observation.agents
                : [],
            }),
        });
      case "hook":
        return importStep(yield* HookManager, { ...common, target: { type: "hook", name } });
    }
  });

  const plan: Plan<ImportNativeExtensionRequirements> = {
    _tag: "Plan",
    name: importNativeExtensionPlanName(request.type),
    materialPaths: settled.materialPaths,
    description: Option.some(
      request.type === "mcp-server"
        ? `Losslessly convert ${settled.origin} into ${fqn}; native MCP config is replaced only after managed validation`
        : `Losslessly convert ${settled.origin} into ${fqn}; the native source remains unchanged and the import starts ${enabled ? "enabled" : "disabled"}`,
    ),
    presentation: operationPresentation(
      { imperative: "import", past: "Imported", gerund: "Importing" },
      target.type,
    ),
    jobs: [{ concurrency: 1, steps: [step] }],
  };

  return {
    type: request.type,
    fqn,
    owner: target.owner,
    name,
    origin: settled.origin,
    authoredPath,
    settingsPath,
    enabled,
    execution: yield* prepareExecutionCandidate(plan),
  } satisfies ImportNativeExtensionCandidate;
});

// -----------------------------------------------------------------------------
// previewOrApply
// -----------------------------------------------------------------------------

/** Preview or apply a settled native import, resolving to one operation outcome. */
export const previewOrApplyImportNativeExtension = (
  candidate: ImportNativeExtensionCandidate,
  execution: PlanExecution,
) => resolveExecutionCandidate(candidate.execution, execution);

/** The native-import use case: settle a request, then preview or apply it. */
export const ImportNativeExtension = {
  prepare: prepareImportNativeExtension,
  previewOrApply: previewOrApplyImportNativeExtension,
} as const;

/**
 * Importing native, unmanaged content as an authored AXM package.
 *
 * Three routes share one decision: a native skill directory or file, a native
 * subagent document, and a native MCP connection declared in an agent's own
 * config all become a workspace-authored package that carries the identity the
 * person asked for, not the identity the native content happened to have. The
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
import * as FileSystem from "effect/FileSystem";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type * as Scope from "effect/Scope";

import {
  ExtensionManagers,
  McpSecretStore,
  buildAuthoredExtensionStep,
  copyExtensionDirectory,
  createCanonicalDirectory,
  materializeAuthoredMcpServer,
  recoverCanonicalDirectory,
  retireNativeMcpEntry,
  type AuthoredExtensionOperationArgs,
  type ExtensionManager,
  type ManagerRequirements,
  type MaterializationFacts,
  type NativeMcpEntryRef,
  type RecipeRequirements,
} from "@agentxm/extension-materialization";
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
import {
  MCP_SERVER_MANIFEST_FILENAME,
  MCP_SERVER_MANIFEST_SCHEMA_URL,
  MCP_SERVER_REGISTRY_SERVER_SCHEMA_URL,
  type McpServerManifest,
} from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import {
  SourceHostProviders,
  WorkspaceCatalog,
  acquireExternalSource,
  resolveSource,
  type SourceResolutionFailure,
} from "@agentxm/extension-sources";
import {
  operationPresentation,
  prepareExecutionCandidate,
  resolveExecutionCandidate,
  type CandidateFingerprintFailed,
  type ExecutionCandidate,
  type JobStepArtifact,
  type JobStepArtifactTarget,
  type Plan,
  type PlanExecution,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import type { CodingAgentRepository } from "@agentxm/workspace-projection";
import {
  WorkspaceMutations,
  type ConfiguredAgentOutcomesProvider,
  computePackageContentHash,
  type LockfileValidationError,
  type PackageContentHashFailed,
  type WorkspaceLockfileReadFailure,
  type WorkspaceSettingsReadFailure,
} from "@agentxm/workspace-state";

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
import { authoringStepFailure, type AuthoringStepFailure } from "../step-failure.js";
import type { FrontmatterParseFailure } from "@agentxm/extension-content";

/** The version an imported package starts at. */
const INITIAL_IMPORT_VERSION = decodeVersionSync("0.1.0");

// -----------------------------------------------------------------------------
// Request
// -----------------------------------------------------------------------------

/** The extension types native content can be imported as. */
export type NativeImportType = "skill" | "subagent" | "mcp-server";

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
    readonly url: string;
    readonly headers: Readonly<Record<string, string>>;
  }>;
  /** Connection inputs the declaration carries. */
  readonly env: Readonly<Record<string, string>>;
  /** Every native declaration of this connection, across agent config files. */
  readonly entries: ReadonlyArray<NativeMcpEntryRef>;
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
  ImportNativeSkillRequest | ImportNativeSubagentRequest | ImportNativeMcpServerRequest;

// -----------------------------------------------------------------------------
// Candidate
// -----------------------------------------------------------------------------

/** What every step in a native import may require when it runs. */
export type ImportNativeExtensionRequirements =
  | ManagerRequirements
  | RecipeRequirements
  | WorkspaceMutations
  | CodingAgentRepository
  | McpSecretStore;

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
  | AuthoredPackageError
  | FrontmatterParseFailure
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
  | FileSystem.FileSystem
  | Path.Path
  | Scope.Scope
  | HttpClient.HttpClient
  | WorkspaceMutations
  | ExtensionManagers
  | SourceHostProviders
  | WorkspaceCatalog
  | ConfiguredAgentOutcomesProvider;

/** Build the import step with the requirements this use case keeps in `R`. */
const importStep = <TRef extends ExtensionRef, TFacts extends MaterializationFacts>(
  manager: ExtensionManager<TRef, TFacts, ManagerRequirements>,
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
    readonly url: string;
    readonly headers: Readonly<Record<string, string>>;
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
  return Effect.succeed({
    candidate,
    url: candidate.remote.value.url,
    headers: candidate.remote.value.headers,
  });
};

/** The manifest a converted native connection is published as. */
const convertedMcpManifest = (args: {
  readonly owner: Handle;
  readonly name: ExtensionName;
  readonly nativeName: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
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
        type: "streamable-http",
        url: args.url,
        ...(Object.keys(args.headers).length === 0
          ? {}
          : {
              headers: Object.entries(args.headers).map(([name, value]) => ({ name, value })),
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
  readonly env: Readonly<Record<string, string>>;
  /** Native files the conversion may rewrite, protected by the transaction. */
  readonly nativeTargets: ReadonlyArray<string>;
  /** Files the staged package must contain before it is published. */
  readonly requiredFiles: ReadonlyArray<string> | undefined;
  readonly populate: (
    stagingPath: string,
  ) => Effect.Effect<void, AuthoringStepFailure, FileSystem.FileSystem | Path.Path>;
  readonly validate:
    | ((
        publicationPath: string,
      ) => Effect.Effect<void, AuthoringStepFailure, FileSystem.FileSystem | Path.Path>)
    | undefined;
  /** Retire the native declaration the managed package replaced. */
  readonly retireNative: Effect.Effect<void, AuthoringStepFailure, FileSystem.FileSystem>;
}

/**
 * Convert a native skill or subagent by staging the rewritten package now and
 * pinning its content hash, so content that changes between preview and apply
 * refuses instead of landing.
 */
const nativeConversion = Effect.fn("ImportNativeExtension.nativeConversion")(function* (args: {
  readonly request: ImportNativeSkillRequest | ImportNativeSubagentRequest;
  readonly target: ExtensionFqnParts;
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
  });
  const stagedHash = yield* computePackageContentHash(stagedPackage);
  return {
    origin: acquired.origin,
    env: {},
    nativeTargets: [],
    requiredFiles: undefined,
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
}) {
  const { candidate, url, headers } = yield* selectNativeMcpCandidate(args.request.discovery);
  const manifest = convertedMcpManifest({
    owner: args.owner,
    name: args.name,
    nativeName: candidate.name,
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
    env: candidate.env,
    nativeTargets: Array.from(new Set(entries.map((entry) => entry.filePath))).sort(),
    requiredFiles: [MCP_SERVER_MANIFEST_FILENAME],
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
    retireNative: Effect.forEach(entries, retireNativeMcpEntry, { discard: true }),
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
  const ws = yield* WorkspaceMutations;
  const path = yield* Path.Path;
  const managers = yield* ExtensionManagers;

  const target = yield* Effect.fromResult(parseFqn(request.target));
  if (target.type !== request.type) {
    return yield* new AuthoringFailed({
      category: "validation",
      detail: `Expected a ${extensionTypeToPlural[request.type]} target FQN, got ${request.target}`,
    });
  }
  yield* requireAuthoredOwner(target.owner, { subject: "package", command: "import" });
  if (ws.layout.scope !== "project") {
    return yield* new AuthoringScopeUnsupported({ subject: "import", scope: ws.layout.scope });
  }

  const name = target.name;
  const fqn = formatFqn(target);
  const targetDir = path.join(ws.layout.authoredRoot(target.type), name);
  const authoredPath = path.relative(ws.baseDir, targetDir);
  const settingsPath = settingsRelativePath(path, ws);
  const subject = request.type === "mcp-server" ? "MCP package" : "Import target";

  const createOnly = preflightCreateOnly({
    subject,
    name,
    configured: false,
    destinations: [targetDir],
  });
  yield* createOnly;

  const declaration = authoredDeclaration(ws, target.type, name);
  const current = yield* declaration.read;

  const settled: SettledConversion =
    request.type === "mcp-server"
      ? yield* mcpConversion({ request, owner: target.owner, name })
      : yield* nativeConversion({ request, target });

  const enabled =
    request.type === "mcp-server"
      ? request.enable
      : request.enable || Option.getOrElse(current.enabled, () => false);
  const env = request.type === "mcp-server" ? settled.env : current.env;

  const artifact: JobStepArtifact = {
    path: authoredPath,
    scope: ws.scope,
    version: INITIAL_IMPORT_VERSION,
    change: "created",
    targets: [
      { path: authoredPath, change: "created" },
      { path: settingsPath, change: "created" },
      ...settled.nativeTargets.map(
        (filePath) =>
          ({
            path: path.relative(ws.baseDir, filePath),
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
    message: `Imported ${fqn}`,
    enabled,
    allowConfiguredSourceTransition: true,
    markAuthored: declaration.declare({ enabled: true, env }),
    finalizeAuthored: declaration
      .declare({ enabled, env })
      .pipe(Effect.andThen(settled.retireNative), Effect.asVoid),
    plannedArtifact: artifact,
    buildArtifact: () => Effect.succeed(artifact),
    preflight: Effect.gen(function* () {
      yield* recoverCanonicalDirectory({ baseDir: ws.baseDir, canonicalPath: targetDir });
      yield* createOnly;
    }),
    scaffold: createCanonicalDirectory<AuthoringStepFailure, FileSystem.FileSystem | Path.Path>({
      baseDir: ws.baseDir,
      canonicalPath: targetDir,
      subject,
      ...(settled.requiredFiles === undefined ? {} : { requiredFiles: settled.requiredFiles }),
      populate: settled.populate,
      ...(settled.validate === undefined ? {} : { validate: settled.validate }),
    }).pipe(Effect.asVoid),
  } as const;

  const step = (() => {
    switch (request.type) {
      case "skill":
        return importStep(managers.skill, { ...common, target: { type: "skill", name } });
      case "subagent":
        return importStep(managers.subagent, { ...common, target: { type: "subagent", name } });
      case "mcp-server":
        return importStep(managers["mcp-server"], {
          ...common,
          target: { type: "mcp-server", name },
          materializeWhenDisabled: true,
          materializeInstall: (ref) =>
            materializeAuthoredMcpServer({ ref, nonInteractive: request.nonInteractive }),
        });
    }
  })();

  const plan: Plan<ImportNativeExtensionRequirements> = {
    _tag: "Plan",
    name: importNativeExtensionPlanName(request.type),
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

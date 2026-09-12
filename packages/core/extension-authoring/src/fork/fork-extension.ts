/**
 * Forking a managed AXM package into workspace authorship.
 *
 * A fork reads one package out of a source the person named, rewrites its
 * identity to the target the workspace will author, and publishes it as a new
 * canonical package. The source is never touched, and the fork starts at its
 * own initial version rather than inheriting the original's.
 *
 * `prepare` settles every decision and stages the rewritten package into a
 * scoped temporary directory: which package the source resolves to, whether
 * the target identity is one this workspace may author, whether the
 * destination is free, and what activation the fork carries. Nothing under
 * the workspace is written. `previewOrApply` resolves the frozen candidate, so
 * a preview and an apply describe one decision — and the staged content is
 * re-hashed before publication, so content that changed between the two
 * refuses rather than lands.
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
  copyExtensionDirectory,
  createCanonicalDirectory,
  recoverCanonicalDirectory,
  type ExtensionManager,
  type ManagerRequirements,
  type MaterializationFacts,
} from "@agentxm/extension-materialization";
import { materializeAuthoredMcpServer } from "@agentxm/workspace-reconciliation";
import {
  buildAuthoredExtensionStep,
  type AuthoredExtensionOperationArgs,
  type RecipeRequirements,
} from "@agentxm/workspace-reconciliation";
import {
  extensionTypeFromPlural,
  extensionTypeToPlural,
  formatFqn,
  parseFqn,
  parseSourceQualifiedRegistrySourcePatternParts,
  type ExtensionFqnParts,
  type ExtensionType,
  type FqnInvalidError,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import {
  SourceHostProviders,
  WorkspaceCatalog,
  findExtensionPackagesFromSource,
  inspectExtensionPackage,
  resolveSource,
  type ExtensionPackageFilter,
  type ResolvedExtensionPackage,
  type SourceResolutionFailure,
} from "@agentxm/extension-sources";
import {
  operationPresentation,
  prepareExecutionCandidate,
  resolveExecutionCandidate,
  type CandidateFingerprintFailed,
  type ExecutionCandidate,
  type JobStepArtifact,
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
import { preflightCreateOnly } from "../create-preflight.js";
import { AuthoringFailed } from "../errors.js";
import type { AuthoredPackageError } from "../authored-package-errors.js";
import { authoringStepFailure, type AuthoringStepFailure } from "../step-failure.js";
import type { FrontmatterParseFailure } from "@agentxm/extension-content";
import { requireAuthoredOwner, settingsRelativePath } from "../create/authoring-owner.js";
import {
  AuthoringScopeUnsupported,
  type AuthoringOwnerMismatch,
  type AuthoringOwnerRequired,
} from "../create/errors.js";
import { forkExtensionPackage } from "../fork-package.js";

/** The version a fork starts at, regardless of what the source published. */
const INITIAL_FORK_VERSION = "0.1.0";

// -----------------------------------------------------------------------------
// Request
// -----------------------------------------------------------------------------

export interface ForkExtensionRequest {
  /** Registry, workspace, local, or Git AXM package source, as typed. */
  readonly source: string;
  /** Owner-qualified identity the fork will carry. */
  readonly target: string;
  /** Source package identity, when the source holds more than one package. */
  readonly from: Option.Option<string>;
  /** Materialize the fork immediately instead of leaving it declared and inert. */
  readonly enable: boolean;
  /**
   * Whether the invoking surface can prompt for a connection input an MCP
   * server's manifest requires.
   */
  readonly nonInteractive: boolean;
}

// -----------------------------------------------------------------------------
// Candidate
// -----------------------------------------------------------------------------

/** What every step in a fork may require when it runs. */
export type ForkExtensionRequirements =
  | ManagerRequirements
  | RecipeRequirements
  | WorkspaceMutations
  | CodingAgentRepository
  | McpSecretStore;

/** A settled fork: every decision is made and nothing under the workspace is written. */
export interface ForkExtensionCandidate {
  readonly type: ExtensionType;
  /** Owner-qualified identity of the fork. */
  readonly fqn: string;
  readonly owner: Handle;
  readonly name: string;
  /** Owner-qualified identity of the package the fork was taken from. */
  readonly sourceFqn: string;
  /** Where the source package was found, in operator-facing terms. */
  readonly origin: string;
  /** Workspace-relative directory the fork will occupy. */
  readonly authoredPath: string;
  /** Workspace-relative settings file the declaration is written to. */
  readonly settingsPath: string;
  /** Whether the fork is materialized once it is declared. */
  readonly enabled: boolean;
  readonly execution: ExecutionCandidate<ForkExtensionRequirements>;
}

/** Every failure settling a fork can surface before anything is written. */
export type ForkExtensionFailure =
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

/** Everything settling a fork reads before it freezes a candidate. */
export type PrepareForkExtensionRequirements =
  | FileSystem.FileSystem
  | Path.Path
  | Scope.Scope
  | HttpClient.HttpClient
  | WorkspaceMutations
  | ExtensionManagers
  | SourceHostProviders
  | WorkspaceCatalog
  | ConfiguredAgentOutcomesProvider;

// -----------------------------------------------------------------------------
// Source selection
// -----------------------------------------------------------------------------

const exactFilter = (fqn: ExtensionFqnParts): ExtensionPackageFilter => ({
  names: [fqn.name],
  owner: Option.some(fqn.owner),
  type: fqn.type,
});

/**
 * Which packages in the named source the fork will consider.
 *
 * An explicit `--from` identity is decisive. Otherwise a source that already
 * names an owner, type, and name in its own syntax narrows to that package,
 * and anything else considers every package the source holds — which is what
 * makes "the source contains more than one" an answerable ambiguity rather
 * than a silent first-match.
 */
const filterForSource = (
  source: string,
  from: Option.Option<string>,
): Effect.Effect<ExtensionPackageFilter, FqnInvalidError> => {
  if (Option.isSome(from)) {
    return Effect.fromResult(parseFqn(from.value)).pipe(Effect.map(exactFilter));
  }
  const registry = parseSourceQualifiedRegistrySourcePatternParts(source);
  if (registry?.type !== undefined && registry.name !== undefined) {
    return Effect.succeed({
      names: [registry.name],
      owner: Option.some(registry.owner),
      type: extensionTypeFromPlural[registry.type],
    });
  }
  return Effect.succeed({ names: [], owner: Option.none(), type: "*" });
};

const selectPackage = (
  packages: ReadonlyArray<ResolvedExtensionPackage>,
): Effect.Effect<ResolvedExtensionPackage, AuthoringFailed> => {
  const candidate = packages[0];
  if (candidate === undefined) {
    return Effect.fail(
      new AuthoringFailed({
        category: "not_found",
        detail:
          "No managed AXM extension package was found; use skills import or subagents import for supported unmanaged/native content",
      }),
    );
  }
  if (packages.length > 1) {
    return Effect.fail(
      new AuthoringFailed({
        category: "validation",
        detail: "The source contains multiple AXM packages; select one with --from <FQN>",
      }),
    );
  }
  return Effect.succeed(candidate);
};

/**
 * Build the fork's publication step with the requirements this use case keeps
 * in `R`, so the workspace facade and the credential store stay requirements
 * rather than captured values.
 */
const forkStep = <TRef extends ExtensionRef, TFacts extends MaterializationFacts>(
  manager: ExtensionManager<TRef, TFacts, ManagerRequirements>,
  args: AuthoredExtensionOperationArgs<
    TRef,
    TFacts,
    AuthoringStepFailure,
    ForkExtensionRequirements
  >,
): PlannedJobStep<ForkExtensionRequirements | RecipeRequirements> =>
  buildAuthoredExtensionStep<TRef, TFacts, AuthoringStepFailure, ForkExtensionRequirements>(
    manager,
    args,
  );

/** The plan a fork resolves; it names the operation everywhere the fork is reported. */
export const forkExtensionPlanName = "Fork AXM extension package";

// -----------------------------------------------------------------------------
// prepare
// -----------------------------------------------------------------------------

/** Settle a fork and stage its content without writing anything to the workspace. */
export const prepareForkExtension: (
  request: ForkExtensionRequest,
) => Effect.Effect<ForkExtensionCandidate, ForkExtensionFailure, PrepareForkExtensionRequirements> =
  Effect.fn("ForkExtension.prepare")(function* (request) {
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const managers = yield* ExtensionManagers;
    const providers = yield* SourceHostProviders;

    const target = yield* Effect.fromResult(parseFqn(request.target));
    yield* requireAuthoredOwner(target.owner, { subject: "package", command: "fork" });
    if (ws.layout.scope !== "project") {
      return yield* new AuthoringScopeUnsupported({ subject: "fork", scope: ws.layout.scope });
    }

    const source = yield* resolveSource(request.source);
    const filter = yield* filterForSource(request.source, request.from);
    const packages =
      source.type === "workspace"
        ? [
            {
              ...(yield* inspectExtensionPackage(
                path.join(ws.layout.authoredRoot(source.extensionType), source.name),
              )),
              origin: providers.origin(source),
            },
          ].filter((candidate) =>
            filter.type !== "*" && filter.type !== candidate.identity.type
              ? false
              : filter.names.length > 0 && !filter.names.includes(candidate.identity.name)
                ? false
                : Option.isNone(filter.owner) || filter.owner.value === candidate.identity.owner,
          )
        : yield* findExtensionPackagesFromSource(source, filter);
    const selected = yield* selectPackage(packages);

    const name = target.name;
    const targetDir = path.join(ws.layout.authoredRoot(target.type), name);
    const authoredPath = path.relative(ws.baseDir, targetDir);
    const settingsPath = settingsRelativePath(path, ws);
    const fqn = formatFqn(target);

    // Refuse an occupied destination here, so a preview refuses it too; the
    // closure repeats the check under the transaction lock in case the
    // destination is claimed between preview and apply.
    const createOnly = preflightCreateOnly({
      subject: "Fork target",
      name,
      configured: false,
      destinations: [targetDir],
    });
    yield* createOnly;

    const stagingRoot = yield* fs.makeTempDirectoryScoped({ prefix: "axm-fork-" }).pipe(
      Effect.mapError(
        (cause) =>
          new AuthoringFailed({
            category: "internal",
            detail: "Fork staging directory could not be created",
            cause,
          }),
      ),
    );
    const stagedPackage = path.join(stagingRoot, "package");
    yield* forkExtensionPackage({
      sourceDir: selected.directory,
      targetDir: stagedPackage,
      sourceIdentity: selected.identity,
      target,
    });
    const stagedHash = yield* computePackageContentHash(stagedPackage);

    const declaration = authoredDeclaration(ws, target.type, name);
    const current = yield* declaration.read;
    const enabled = request.enable || Option.getOrElse(current.enabled, () => false);

    const artifact: JobStepArtifact = {
      path: authoredPath,
      scope: ws.scope,
      version: INITIAL_FORK_VERSION,
      change: "created",
      targets: [
        { path: authoredPath, change: "created" },
        { path: settingsPath, change: "created" },
      ],
    };
    const sourceFqn = `${selected.identity.owner}/${extensionTypeToPlural[selected.identity.type]}/${selected.identity.name}`;
    const common = {
      toStepFailure: authoringStepFailure,
      location: targetDir,
      versionRange: Option.none<string>(),
      label: `Fork ${sourceFqn} -> ${fqn}`,
      message: `Forked ${fqn}`,
      enabled,
      allowConfiguredSourceTransition: true,
      markAuthored: declaration.declare({ enabled: true, env: current.env }),
      finalizeAuthored: declaration.declare({ enabled, env: current.env }),
      plannedArtifact: artifact,
      buildArtifact: () => Effect.succeed(artifact),
      preflight: Effect.gen(function* () {
        yield* recoverCanonicalDirectory({ baseDir: ws.baseDir, canonicalPath: targetDir });
        yield* createOnly;
      }),
      scaffold: createCanonicalDirectory<AuthoringStepFailure, FileSystem.FileSystem | Path.Path>({
        baseDir: ws.baseDir,
        canonicalPath: targetDir,
        subject: "Fork target",
        populate: (publicationPath) =>
          copyExtensionDirectory(stagedPackage, publicationPath).pipe(
            Effect.mapError(
              (cause) =>
                new AuthoringFailed({
                  category: "internal",
                  detail: `Prepared fork could not be staged for ${authoredPath}`,
                  cause,
                }),
            ),
          ),
        validate: (publicationPath) =>
          computePackageContentHash(publicationPath).pipe(
            Effect.flatMap((currentHash) =>
              currentHash === stagedHash
                ? Effect.void
                : new AuthoringFailed({
                    category: "conflict",
                    detail: "Prepared fork content changed before it could be applied",
                  }),
            ),
          ),
      }).pipe(Effect.asVoid),
    } as const;

    const step = (() => {
      switch (target.type) {
        case "skill":
          return forkStep(managers.skill, { ...common, target: { type: "skill", name } });
        case "subagent":
          return forkStep(managers.subagent, { ...common, target: { type: "subagent", name } });
        case "rule":
          return forkStep(managers.rule, { ...common, target: { type: "rule", name } });
        case "hook":
          return forkStep(managers.hook, { ...common, target: { type: "hook", name } });
        case "knowledge":
          return forkStep(managers.knowledge, { ...common, target: { type: "knowledge", name } });
        case "pack":
          return forkStep(managers.pack, {
            ...common,
            target: { type: "pack", owner: target.owner, name },
          });
        case "mcp-server":
          return forkStep(managers["mcp-server"], {
            ...common,
            target: { type: "mcp-server", name },
            materializeInstall: (ref) =>
              materializeAuthoredMcpServer({ ref, nonInteractive: request.nonInteractive }),
          });
      }
    })();

    const plan: Plan<ForkExtensionRequirements> = {
      _tag: "Plan",
      name: forkExtensionPlanName,
      description: Option.some(
        `Create ${fqn} from ${selected.origin}; the source remains unchanged and the fork starts ${enabled ? "enabled" : "disabled"}`,
      ),
      presentation: operationPresentation(
        { imperative: "fork", past: "Forked", gerund: "Forking" },
        target.type,
      ),
      jobs: [{ concurrency: 1, steps: [step] }],
    };

    return {
      type: target.type,
      fqn,
      owner: target.owner,
      name,
      sourceFqn,
      origin: selected.origin,
      authoredPath,
      settingsPath,
      enabled,
      execution: yield* prepareExecutionCandidate(plan),
    } satisfies ForkExtensionCandidate;
  });

// -----------------------------------------------------------------------------
// previewOrApply
// -----------------------------------------------------------------------------

/** Preview or apply a settled fork, resolving to one operation outcome. */
export const previewOrApplyForkExtension = (
  candidate: ForkExtensionCandidate,
  execution: PlanExecution,
) => resolveExecutionCandidate(candidate.execution, execution);

/** The fork use case: settle a request, then preview or apply it. */
export const ForkExtension = {
  prepare: prepareForkExtension,
  previewOrApply: previewOrApplyForkExtension,
} as const;

/**
 * Adopting an acquired package into workspace authorship.
 *
 * Adoption moves rather than copies: the canonical package the workspace
 * acquired becomes the authored package, its accepted external resolution is
 * retired, and its declaration is rewritten to name the workspace as its
 * source. The activation it already carried is preserved, and a package that
 * was never declared becomes enabled — adopting content you cannot see would
 * leave the workspace holding authored work it never materializes.
 *
 * `prepare` settles the identity, the destination, and the activation, and
 * writes nothing. `previewOrApply` resolves that same candidate inside the
 * workspace transaction, so a failed move restores both directories.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import {
  ExtensionManagers,
  McpSecretStore,
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
  extensionTypeToPlural,
  formatFqn,
  parseFqn,
  type ExtensionType,
  type FqnInvalidError,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
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
  resolveWorkspaceExtensionRef,
  type LockfileValidationError,
  type WorkspaceLockfileReadFailure,
  type WorkspaceSettingsReadFailure,
} from "@agentxm/workspace-state";
import { protectCreatedAncestors } from "@agentxm/workspace-transactions";

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
import { authoringStepFailure, type AuthoringStepFailure } from "../step-failure.js";

// -----------------------------------------------------------------------------
// Request
// -----------------------------------------------------------------------------

export interface AdoptExtensionRequest {
  /** Canonical, owner-qualified identity of the package being adopted. */
  readonly fqn: string;
  /**
   * Whether the invoking surface can prompt for a connection input an MCP
   * server's manifest requires.
   */
  readonly nonInteractive: boolean;
}

// -----------------------------------------------------------------------------
// Candidate
// -----------------------------------------------------------------------------

/** What every step in an adoption may require when it runs. */
export type AdoptExtensionRequirements =
  | ManagerRequirements
  | RecipeRequirements
  | WorkspaceMutations
  | CodingAgentRepository
  | McpSecretStore;

/** A settled adoption: every decision is made and nothing is written. */
export interface AdoptExtensionCandidate {
  readonly type: ExtensionType;
  readonly fqn: string;
  readonly owner: Handle;
  readonly name: string;
  /** Workspace-relative directory the package is moved out of. */
  readonly acquiredPath: string;
  /** Workspace-relative directory the package is moved into. */
  readonly authoredPath: string;
  /** Workspace-relative settings file the declaration is rewritten in. */
  readonly settingsPath: string;
  /** The activation the adopted package keeps. */
  readonly enabled: boolean;
  readonly execution: ExecutionCandidate<AdoptExtensionRequirements>;
}

/** Every failure settling an adoption can surface before anything is written. */
export type AdoptExtensionFailure =
  | AuthoringFailed
  | AuthoredPackageError
  | AuthoringOwnerRequired
  | AuthoringOwnerMismatch
  | AuthoringScopeUnsupported
  | LockfileValidationError
  | WorkspaceLockfileReadFailure
  | WorkspaceSettingsReadFailure
  | CandidateFingerprintFailed
  | FqnInvalidError;

/** Everything settling an adoption reads before it freezes a candidate. */
export type PrepareAdoptExtensionRequirements =
  | FileSystem.FileSystem
  | Path.Path
  | HttpClient.HttpClient
  | WorkspaceMutations
  | ExtensionManagers
  | ConfiguredAgentOutcomesProvider;

/**
 * Build the adoption step with the requirements this use case keeps in `R`.
 */
const adoptStep = <TRef extends ExtensionRef, TFacts extends MaterializationFacts>(
  manager: ExtensionManager<TRef, TFacts, ManagerRequirements>,
  args: AuthoredExtensionOperationArgs<
    TRef,
    TFacts,
    AuthoringStepFailure,
    AdoptExtensionRequirements
  >,
): PlannedJobStep<AdoptExtensionRequirements | RecipeRequirements> =>
  buildAuthoredExtensionStep<TRef, TFacts, AuthoringStepFailure, AdoptExtensionRequirements>(
    manager,
    args,
  );

/** The plan an adoption resolves. */
export const adoptExtensionPlanName = "Adopt workspace extension";

// -----------------------------------------------------------------------------
// prepare
// -----------------------------------------------------------------------------

/** Settle an adoption without writing anything. */
export const prepareAdoptExtension: (
  request: AdoptExtensionRequest,
) => Effect.Effect<
  AdoptExtensionCandidate,
  AdoptExtensionFailure,
  PrepareAdoptExtensionRequirements
> = Effect.fn("AdoptExtension.prepare")(function* (request) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const managers = yield* ExtensionManagers;

  const parsed = yield* Effect.fromResult(parseFqn(request.fqn));
  if (ws.layout.scope !== "project") {
    return yield* new AuthoringScopeUnsupported({ subject: "adoption", scope: ws.layout.scope });
  }
  yield* requireAuthoredOwner(parsed.owner, { subject: "package", command: "adopt" });

  const name = parsed.name;
  const fqn = formatFqn(parsed);
  const sourceDir = path.join(
    ws.layout.acquiredRoot,
    "agentxm",
    parsed.owner,
    extensionTypeToPlural[parsed.type],
    name,
  );
  const targetDir = path.join(ws.layout.authoredRoot(parsed.type), name);
  const acquiredPath = path.relative(ws.baseDir, sourceDir);
  const authoredPath = path.relative(ws.baseDir, targetDir);
  const settingsPath = settingsRelativePath(path, ws);

  // Refuse an occupied authoring destination here, so a preview refuses it
  // too; the closure repeats the check under the transaction lock.
  const createOnly = preflightCreateOnly({
    subject: "Adopt target",
    name,
    configured: false,
    destinations: [targetDir],
  });
  yield* createOnly;

  const declaration = authoredDeclaration(ws, parsed.type, name);
  const current = yield* declaration.read;
  // A package the workspace never declared becomes enabled: adopting content
  // that stays invisible is not what adoption was asked for.
  const enabled = Option.getOrElse(current.enabled, () => true);

  const artifact: JobStepArtifact = {
    path: authoredPath,
    scope: ws.scope,
    change: "created",
    targets: [
      { path: acquiredPath, change: "removed" },
      { path: authoredPath, change: "created" },
      { path: settingsPath, change: "updated" },
    ],
  };

  const common = {
    toStepFailure: authoringStepFailure,
    location: targetDir,
    transactionTargets: [sourceDir],
    versionRange: Option.none<string>(),
    label: `Adopt ${fqn}`,
    message: `Adopted ${fqn}`,
    enabled,
    allowConfiguredSourceTransition: true,
    markAuthored: Effect.andThen(
      declaration.retireExternalResolution,
      declaration.declare({ enabled: true, env: current.env }),
    ),
    finalizeAuthored: declaration.declare({ enabled, env: current.env }),
    plannedArtifact: artifact,
    buildArtifact: () => Effect.succeed(artifact),
    preflight: Effect.gen(function* () {
      yield* createOnly;
      // The acquired directory must already hold a resolvable package: a move
      // that lands unreadable content would leave the workspace authoring
      // something it cannot materialize.
      yield* resolveWorkspaceExtensionRef({
        settingsName: name,
        source: "workspace",
        expectedType: parsed.type,
        layout: ws.layout,
        scope: ws.scope,
        staticPackage: { owner: parsed.owner, name, root: sourceDir },
      });
    }).pipe(Effect.asVoid),
    scaffold: Effect.gen(function* () {
      yield* protectCreatedAncestors(fs, path, path.dirname(targetDir));
      yield* fs.makeDirectory(path.dirname(targetDir), { recursive: true });
      yield* fs.rename(sourceDir, targetDir);
    }).pipe(
      Effect.mapError(
        (cause) =>
          new AuthoringFailed({
            category: "internal",
            detail: `Could not move ${fqn} into authored package storage`,
            cause,
          }),
      ),
    ),
  } as const;

  const step = (() => {
    switch (parsed.type) {
      case "skill":
        return adoptStep(managers.skill, { ...common, target: { type: "skill", name } });
      case "subagent":
        return adoptStep(managers.subagent, { ...common, target: { type: "subagent", name } });
      case "rule":
        return adoptStep(managers.rule, { ...common, target: { type: "rule", name } });
      case "hook":
        return adoptStep(managers.hook, { ...common, target: { type: "hook", name } });
      case "knowledge":
        return adoptStep(managers.knowledge, { ...common, target: { type: "knowledge", name } });
      case "pack":
        return adoptStep(managers.pack, {
          ...common,
          target: { type: "pack", owner: parsed.owner, name },
        });
      case "mcp-server":
        return adoptStep(managers["mcp-server"], {
          ...common,
          target: { type: "mcp-server", name },
          materializeInstall: (ref) =>
            materializeAuthoredMcpServer({ ref, nonInteractive: request.nonInteractive }),
        });
    }
  })();

  const plan: Plan<AdoptExtensionRequirements> = {
    _tag: "Plan",
    name: adoptExtensionPlanName,
    description: Option.some(
      "Adopt the canonical package as authoritative workspace source content",
    ),
    presentation: operationPresentation(
      { imperative: "adopt", past: "Adopted", gerund: "Adopting" },
      parsed.type,
    ),
    jobs: [{ concurrency: 1, steps: [step] }],
  };

  return {
    type: parsed.type,
    fqn,
    owner: parsed.owner,
    name,
    acquiredPath,
    authoredPath,
    settingsPath,
    enabled,
    execution: yield* prepareExecutionCandidate(plan),
  } satisfies AdoptExtensionCandidate;
});

// -----------------------------------------------------------------------------
// previewOrApply
// -----------------------------------------------------------------------------

/** Preview or apply a settled adoption, resolving to one operation outcome. */
export const previewOrApplyAdoptExtension = (
  candidate: AdoptExtensionCandidate,
  execution: PlanExecution,
) => resolveExecutionCandidate(candidate.execution, execution);

/** The adoption use case: settle a request, then preview or apply it. */
export const AdoptExtension = {
  prepare: prepareAdoptExtension,
  previewOrApply: previewOrApplyAdoptExtension,
} as const;

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
 * A package already at its authoring location that nothing declares is
 * adopted in place: the workspace declares it, enabled, and nothing moves.
 * In-place adoption refuses when an installed copy of the same identity also
 * exists, when the workspace already declares the name, and when the authored
 * manifest is invalid or names a different identity.
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
  LockfileReader,
  WorkspaceMutations,
  observeInstallRoot,
  type ConfiguredAgentOutcomesProvider,
  resolveWorkspaceExtensionRef,
  type LockfileValidationError,
  type WorkspaceLockfileReadFailure,
  type WorkspaceSettingsReadFailure,
  type WorkspaceStateReadFailure,
} from "@agentxm/workspace-state";
import { protectCreatedAncestors } from "@agentxm/workspace-transactions";

import { CreateDestinationExists } from "@agentxm/extension-materialization";

import { authoredDeclaration } from "../authored-declaration.js";
import {
  CreateDestinationInspectionFailed,
  type AuthoredPackageError,
} from "../authored-package-errors.js";
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
  /**
   * `move` relocates an installed copy into authorship; `in-place` declares a
   * package already at its authoring location and moves nothing.
   */
  readonly mode: "move" | "in-place";
  /** Workspace-relative directory the package is moved out of, when it moves. */
  readonly acquiredPath: Option.Option<string>;
  /** Workspace-relative authoring directory the adopted package occupies. */
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
  | WorkspaceStateReadFailure
  | CandidateFingerprintFailed
  | FqnInvalidError;

/** Everything settling an adoption reads before it freezes a candidate. */
export type PrepareAdoptExtensionRequirements =
  | FileSystem.FileSystem
  | Path.Path
  | HttpClient.HttpClient
  | WorkspaceMutations
  | LockfileReader
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
  const locks = yield* LockfileReader;

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

  const declaration = authoredDeclaration(ws, parsed.type, name);
  const current = yield* declaration.read;

  // Refuse an occupied authoring destination here, so a preview refuses it
  // too; the closure repeats the check under the transaction lock.
  const createOnly = preflightCreateOnly({
    subject: "Adopt target",
    name,
    configured: false,
    destinations: [targetDir],
  });

  // In-place adoption is decided from what is on disk now and repeated under
  // the transaction lock, so preview and apply refuse the same states.
  const inPlaceRefusals = Effect.gen(function* () {
    const inventory = yield* observeInstallRoot({
      layout: ws.layout,
      graph: yield* ws.getDesiredStateGraph(),
      locks,
    });
    const installedCopy = inventory.packages.find(
      (entry) =>
        entry.type === parsed.type &&
        entry.name === name &&
        (entry.owner === undefined || entry.owner === parsed.owner),
    );
    // Two copies of one identity leave adoption no single content to author.
    if (installedCopy !== undefined) {
      return yield* new CreateDestinationExists({ subject: "Adopt target", path: targetDir });
    }
    const declared = yield* declaration.read;
    if (declared.configured) {
      return yield* new AuthoringFailed({
        category: "conflict",
        detail: `${fqn} is already declared in ${settingsPath}`,
      });
    }
    yield* resolveWorkspaceExtensionRef({
      settingsName: name,
      source: "workspace",
      expectedType: parsed.type,
      layout: ws.layout,
      scope: ws.scope,
      staticPackage: { owner: parsed.owner, name, root: targetDir },
    }).pipe(
      Effect.mapError(
        (cause) =>
          new AuthoringFailed({
            category: "validation",
            detail: `The authored package at ${authoredPath} is not a valid ${fqn} package`,
            cause,
          }),
      ),
    );
  });

  const authoredExists = yield* fs
    .exists(targetDir)
    .pipe(
      Effect.mapError((cause) => new CreateDestinationInspectionFailed({ path: targetDir, cause })),
    );
  const mode: AdoptExtensionCandidate["mode"] = authoredExists ? "in-place" : "move";
  yield* mode === "in-place" ? inPlaceRefusals : createOnly;

  // A package the workspace never declared becomes enabled: adopting content
  // that stays invisible is not what adoption was asked for.
  const enabled = mode === "in-place" ? true : Option.getOrElse(current.enabled, () => true);

  const moveArtifact: JobStepArtifact = {
    path: authoredPath,
    scope: ws.scope,
    change: "created",
    targets: [
      { path: acquiredPath, change: "removed" },
      { path: authoredPath, change: "created" },
      { path: settingsPath, change: "updated" },
    ],
  };
  // In-place adoption writes only the declaration; the authored package keeps
  // every byte, so it is not reported as a changed path.
  const inPlaceArtifact: JobStepArtifact = {
    path: settingsPath,
    scope: ws.scope,
    change: "updated",
    targets: [{ path: settingsPath, change: "updated" }],
  };

  const shared = {
    toStepFailure: authoringStepFailure,
    location: targetDir,
    versionRange: Option.none<string>(),
    label: `Adopt ${fqn}`,
    enabled,
    markAuthored: Effect.andThen(
      declaration.retireExternalResolution,
      declaration.declare({ enabled: true, env: current.env }),
    ),
    finalizeAuthored: declaration.declare({ enabled, env: current.env }),
  } as const;

  const common =
    mode === "in-place"
      ? {
          ...shared,
          message: `Adopted ${fqn} in place`,
          plannedArtifact: inPlaceArtifact,
          buildArtifact: () => Effect.succeed(inPlaceArtifact),
          preflight: inPlaceRefusals,
          scaffold: Effect.void,
        }
      : {
          ...shared,
          message: `Adopted ${fqn}`,
          transactionTargets: [sourceDir],
          allowConfiguredSourceTransition: true,
          plannedArtifact: moveArtifact,
          buildArtifact: () => Effect.succeed(moveArtifact),
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
        };

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
    mode,
    acquiredPath: mode === "move" ? Option.some(acquiredPath) : Option.none(),
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

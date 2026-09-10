/**
 * Shared extension closure recipes — install, materialize, uninstall, and the
 * authored-package transition.
 *
 * A recipe composes one manager's contract into one plan step. Requirements
 * stay explicit: the step declares the manager's `R` plus the transaction
 * scope its closure runs in, and the command boundary composes them once. The
 * facts a materialization observed travel from `materializeInstall` to the
 * settings and lockfile writes and to the step's artifact as values.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type { ExtensionManager, MaterializationFacts } from "../manager-contract.js";
import type { ExtensionManagerFailure } from "../errors.js";
import { LifecyclePostconditionViolated, ScaffoldedExtensionUnresolved } from "./errors.js";
import { SourceAuthorityBlocked } from "@agentxm/extension-resolution";
import {
  applyProjectionPlans,
  projectionPlanExclusionWarnings,
} from "@agentxm/workspace-projection";
import type { StepFailure } from "@agentxm/workspace-operations";
import type { JobStepArtifact, JobStepResult, PlannedJobStep } from "@agentxm/workspace-operations";
import type { RegistryBindingProposal } from "@agentxm/extension-resolution";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { PackageUrlParts } from "@agentxm/extension-model/unstable/packaging/package-url";
import type { ExtensionTarget, ExtensionTargetFor } from "@agentxm/workspace-state";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import { evaluateSourceAuthority } from "@agentxm/extension-resolution";
import { formatDeprecationWarning } from "@agentxm/registry-client";
import { runWorkspaceTransaction } from "@agentxm/workspace-transactions";
import type { WorkspaceTransactionScope } from "@agentxm/workspace-transactions";
import { toExtensionTypePlural } from "@agentxm/extension-model/unstable/extensions/common";

// -----------------------------------------------------------------------------
// Target Helpers
// -----------------------------------------------------------------------------

/**
 * Derive an ExtensionTarget from an ExtensionRef.
 *
 * Pack targets include owner; leaf-extension targets are name-only.
 */
export const targetFromRef = (ref: ExtensionRef): ExtensionTarget => {
  switch (ref.type) {
    case "skill":
      return { type: "skill", name: ref.skill.name };
    case "pack":
      return { type: "pack", name: ref.pack.name, owner: ref.owner };
    case "mcp-server":
      return { type: "mcp-server", name: ref.server.name };
    case "subagent":
      return { type: "subagent", name: ref.subagent.name };
    case "rule":
      return { type: "rule", name: ref.rule.name };
    case "hook":
      return { type: "hook", name: ref.hook.name };
    case "knowledge":
      return { type: "knowledge", name: ref.knowledge.name };
  }
};

export const extensionRefLifecycleWarnings = (ref: ExtensionRef): ReadonlyArray<string> =>
  ref.refType === "registry"
    ? [
        ...(ref.deprecation === undefined
          ? []
          : [
              formatDeprecationWarning(
                `${ref.owner}/${toExtensionTypePlural(ref.type)}/${ref.name}`,
                ref.deprecation,
              ),
            ]),
        ...(ref.lifecycleWarnings ?? []),
      ]
    : [];

export const extensionRefRegistryLifecycle = (ref: ExtensionRef) =>
  ref.refType !== "registry" || ref.deprecation === undefined
    ? undefined
    : { deprecation: ref.deprecation };

/**
 * Produce a display label from an ExtensionTarget.
 *
 * Pack targets render as `owner/name`; others render as `name`.
 */
export const toLabel = (target: ExtensionTarget): string =>
  target.type === "pack" ? `${target.owner}/${target.name}` : target.name;

/**
 * Produce a stable step identity key from an ExtensionTarget.
 *
 * This is internal plan identity, not display text.
 */
export const toStepKey = (target: ExtensionTarget): string =>
  target.type === "pack"
    ? `${target.type}:${target.owner}/${target.name}`
    : `${target.type}:${target.name}`;

/**
 * Format a single PackageUrlParts as a compact display string.
 *
 * Examples: `pkg:npm/react`, `pkg:npm/@angular/core@18.0.0`
 */
export const formatPackageUrlParts = (parts: PackageUrlParts): string => {
  const ns = parts.namespace !== undefined ? `${parts.namespace}/` : "";
  const ver = parts.version !== undefined ? `@${parts.version}` : "";
  return `pkg:${parts.type}/${ns}${parts.name}${ver}`;
};

/**
 * Build a display label with optional packages suffix.
 *
 * When packages is non-empty, appends them parenthesized:
 *   `code-review (pkg:npm/react, pkg:npm/typescript)`
 */
export const toLabelWithCompanions = (
  target: ExtensionTarget,
  packages: ReadonlyArray<PackageUrlParts>,
): string => {
  const base = toLabel(target);
  if (packages.length === 0) return base;
  const purls = packages.map(formatPackageUrlParts).join(", ");
  return `${base} (${purls})`;
};

// -----------------------------------------------------------------------------
// Shared step vocabulary
// -----------------------------------------------------------------------------

/**
 * Cross-cutting uninstall dependency-retention policy: whether an installed
 * Pack still requires the target's package.
 */
export interface UninstallRetentionPolicy<F = never, R = never> {
  readonly isRequiredByInstalledPack: (args: {
    readonly target: ExtensionTarget;
  }) => Effect.Effect<boolean, CallerStepFailure<F>, R>;
}

/**
 * Failure channel for a recipe's typed inputs: the manager failures the recipe
 * itself can surface plus whatever failure family the calling feature supplies
 * through `F`. Nothing in this channel is `unknown`.
 */
export type CallerStepFailure<F = never> = ExtensionManagerFailure | F;

/**
 * The one conversion from a recipe's typed failure union into the serialized
 * plan-step vocabulary. Categories and wording are the boundary's, so machine
 * output does not depend on which side of the seam rendered the failure; the
 * recipe applies it once, at the edge of the step.
 */
export interface StepFailureAdapter<F = never> {
  readonly toStepFailure: (failure: CallerStepFailure<F>) => StepFailure;
}

/**
 * What every recipe adds on top of its manager's own requirements: the
 * transaction scope its closure opens, and the platform that scope reads and
 * writes through.
 */
export type RecipeRequirements = WorkspaceTransactionScope | FileSystem.FileSystem | Path.Path;

const NO_PROJECTION_WARNINGS: ReadonlyArray<string> = [];

/**
 * Render the manager's shared aggregate units and return the operator-facing
 * report for every desired contributor those units could not render. The
 * report travels with the step that performed the render.
 */
const applyManagerProjectionPlans = <
  TRef extends ExtensionRef,
  TMaterialization extends MaterializationFacts,
  R,
>(
  manager: ExtensionManager<TRef, TMaterialization, R>,
): Effect.Effect<ReadonlyArray<string>, ExtensionManagerFailure, R> =>
  manager.projectionPlans === undefined
    ? Effect.succeed(NO_PROJECTION_WARNINGS)
    : manager
        .projectionPlans()
        .pipe(
          Effect.flatMap((plans) =>
            applyProjectionPlans(plans).pipe(Effect.as(projectionPlanExclusionWarnings(plans))),
          ),
        );

// -----------------------------------------------------------------------------
// Install Operation
// -----------------------------------------------------------------------------

export interface InstallOperationArgs<
  TRef extends ExtensionRef,
  TMaterialization extends MaterializationFacts,
  F = never,
  R = never,
> extends StepFailureAdapter<F> {
  readonly ref: TRef;
  readonly versionRange: Option.Option<string>;
  /** When true, re-materialize unconditionally (repair path for forced reinstalls). */
  readonly force?: boolean;
  /** When true, skip writing to settings (e.g. pack dependency installs). */
  readonly skipSettings?: boolean;
  /**
   * When true, skip the trailing shared-projection reconcile (e.g. pack
   * dependency steps, whose closure runs one projection write at the end).
   */
  readonly skipProjections?: boolean;
  /**
   * Defer the manager-wide observable check to an enclosing semantic closure.
   * Pack member transitions use this while other configured Packs are still
   * incomplete; the enclosing Pack graph validates every accepted canonical
   * package and its scoped desired-state postcondition before committing.
   */
  readonly deferObservableValidation?: boolean;
  /** Optional pre-install state probe for artifact change labels. */
  readonly installedBefore?: Effect.Effect<boolean, CallerStepFailure<F>, R>;
  /** Optional presenter metadata computed after materialization/settings writes. */
  readonly buildArtifact?: (args: {
    readonly installedBefore: boolean;
    readonly materialization: Option.Option<TMaterialization>;
  }) => Effect.Effect<JobStepArtifact, CallerStepFailure<F>, R>;
  /** Optional outcome message for type-specific install presenters. */
  readonly message?: string;
  /** Explicit destructive source-authority transition used only by demotion. */
  readonly allowWorkspaceReplacement?: boolean;
}

export interface NewExtensionOperationArgs<
  TRef extends ExtensionRef,
  TMaterialization extends MaterializationFacts,
  F = never,
  R = never,
> extends Omit<
  InstallOperationArgs<TRef, TMaterialization, F, R>,
  "force" | "allowWorkspaceReplacement"
> {
  readonly target: ExtensionTargetFor<TRef>;
  /** Read-only artifact forecast rendered by preview before any mutation occurs. */
  readonly plannedArtifact?: JobStepArtifact;
  /** Collision checks repeated under the workspace transaction lock before the first write. */
  readonly preflight?: Effect.Effect<void, CallerStepFailure<F>, R>;
  readonly scaffold: Effect.Effect<unknown, CallerStepFailure<F>, R>;
  readonly markAuthored: Effect.Effect<void, CallerStepFailure<F>, R>;
  readonly message: string;
  readonly label?: string;
}

export interface AuthoredExtensionOperationArgs<
  TRef extends ExtensionRef,
  TMaterialization extends MaterializationFacts,
  F = never,
  R = never,
> extends Omit<NewExtensionOperationArgs<TRef, TMaterialization, F, R>, "ref"> {
  /** Canonical workspace package path protected by the transaction snapshot. */
  readonly location: string;
  /** Additional files that the authored transition may update transactionally. */
  readonly transactionTargets?: ReadonlyArray<string>;
  /** Whether the new authored extension should remain materialized after creation. */
  readonly enabled?: boolean;
  /** Commit the caller's final desired-state shape after canonical resolution. */
  readonly finalizeAuthored?: Effect.Effect<void, CallerStepFailure<F>, R>;
  /** Type-specific projection path for authored packages with specialized installers. */
  readonly materializeInstall?: (
    ref: TRef,
  ) => Effect.Effect<Option.Option<TMaterialization>, CallerStepFailure<F>, R>;
  /**
   * Project and then deactivate a disabled target when adopting a native
   * configuration requires the projection writer to perform the transition.
   */
  readonly materializeWhenDisabled?: boolean;
  /**
   * Skip the global materializability preflight when replacing an explicitly
   * selected native/configured source with a new workspace-authored package.
   */
  readonly allowConfiguredSourceTransition?: boolean;
}

const isConfigured = <TRef extends ExtensionRef, TMaterialization extends MaterializationFacts, R>(
  manager: ExtensionManager<TRef, TMaterialization, R>,
  target: ExtensionTarget,
): Effect.Effect<boolean, ExtensionManagerFailure, R> => {
  if (manager.isConfigured !== undefined) return manager.isConfigured({ target });
  if (manager.getConfiguredSource === undefined) return Effect.succeed(false);
  return manager.getConfiguredSource({ target }).pipe(Effect.map(Option.isSome));
};

/**
 * Execute the canonical install sequence.
 *
 * Root installs materialize and commit desired state plus any accepted external
 * resolution before validating the observable postcondition. Pack-derived
 * installs omit the root settings declaration while retaining that resolution.
 */
const runInstallOperation = <
  TRef extends ExtensionRef,
  TMaterialization extends MaterializationFacts,
  F,
  R,
>(
  manager: ExtensionManager<TRef, TMaterialization, R>,
  args: InstallOperationArgs<TRef, TMaterialization, F, R>,
): Effect.Effect<JobStepResult, StepFailure, R | RecipeRequirements> =>
  Effect.gen(function* () {
    const target = targetFromRef(args.ref);
    const configuredSource =
      manager.getConfiguredSource === undefined
        ? Option.none<string>()
        : yield* manager.getConfiguredSource({ target });
    const authority = evaluateSourceAuthority({
      target: { ...target, identity: toStepKey(target) },
      relationship: { kind: "root" },
      requested: {
        identity: `${args.ref.refType}:${toStepKey(target)}`,
        workspace: args.ref.refType === "workspace",
      },
      ...(Option.isNone(configuredSource)
        ? {}
        : {
            configured: {
              identity: configuredSource.value,
              workspace: isWorkspaceSourceLocator(configuredSource.value),
            },
          }),
      ...(args.allowWorkspaceReplacement === undefined
        ? {}
        : { allowWorkspaceReplacement: args.allowWorkspaceReplacement }),
    });
    if (authority.kind === "blocked") {
      return yield* new SourceAuthorityBlocked({
        detail: authority.fact.detail,
        recovery: authority.fact.recovery,
      });
    }
    const installedBefore =
      args.installedBefore === undefined ? false : yield* args.installedBefore;
    const transaction = yield* runWorkspaceTransaction({
      transition: Effect.gen(function* () {
        const cleanupSupersededCanonical =
          manager.prepareSourceTransition === undefined
            ? Effect.void
            : yield* manager.prepareSourceTransition({ ref: args.ref });
        const materialization = yield* manager.materializeInstall({
          ref: args.ref,
          ...(args.force === undefined ? {} : { force: args.force }),
        });
        if (!args.skipSettings) {
          yield* manager.upsertSettingsEntry({
            ref: args.ref,
            versionRange: args.versionRange,
            materialization: Option.some(materialization),
          });
        }
        yield* manager.upsertLockfileEntry({
          ref: args.ref,
          materialization: Option.some(materialization),
        });
        yield* cleanupSupersededCanonical;
        // Desired state and canonical content are committed; render every
        // shared aggregate unit once from the complete contributor set.
        const projectionWarnings =
          args.skipProjections !== true
            ? yield* applyManagerProjectionPlans(manager)
            : NO_PROJECTION_WARNINGS;
        return { installedBefore, materialization, projectionWarnings };
      }),
      validate: () =>
        Effect.gen(function* () {
          if (args.deferObservableValidation !== true) {
            const installed = yield* manager.isInstalled({ target });
            if (!installed) {
              return yield* new LifecyclePostconditionViolated({
                postcondition: "install-observable",
                targetType: target.type,
                targetName: target.name,
              });
            }
          }
          if (
            args.skipSettings !== true &&
            (manager.isConfigured !== undefined || manager.getConfiguredSource !== undefined)
          ) {
            const configured = yield* isConfigured(manager, target);
            if (!configured) {
              return yield* new LifecyclePostconditionViolated({
                postcondition: "install-declared",
                targetType: target.type,
                targetName: target.name,
              });
            }
          }
        }),
    });
    const artifact =
      args.buildArtifact === undefined
        ? undefined
        : yield* args.buildArtifact({
            installedBefore,
            materialization: Option.some(transaction.materialization),
          });
    const artifactWithLifecycle =
      artifact === undefined ||
      args.ref.refType !== "registry" ||
      args.ref.deprecation === undefined
        ? artifact
        : { ...artifact, registryLifecycle: { deprecation: args.ref.deprecation } };
    return {
      result: "success" as const,
      message: args.message ?? "Applied install operation",
      ...(artifactWithLifecycle === undefined ? {} : { artifact: artifactWithLifecycle }),
      ...(transaction.projectionWarnings.length === 0
        ? {}
        : { warnings: transaction.projectionWarnings }),
    } satisfies JobStepResult;
  }).pipe(Effect.mapError(args.toStepFailure));

/**
 * Build a PlannedJobStep for an install operation.
 *
 * The step keeps the manager's requirements and the transaction scope in its
 * `run` effect; the command boundary composes them once.
 */
export const buildInstallOperation = <
  TRef extends ExtensionRef,
  TMaterialization extends MaterializationFacts,
  F = never,
  R = never,
>(
  manager: ExtensionManager<TRef, TMaterialization, R>,
  args: InstallOperationArgs<TRef, TMaterialization, F, R>,
): PlannedJobStep<R | RecipeRequirements> => {
  const target = targetFromRef(args.ref);
  const companionPkgs = args.ref.refType === "registry" ? args.ref.packages : [];
  const lifecycleWarnings = extensionRefLifecycleWarnings(args.ref);
  const registryLifecycle = extensionRefRegistryLifecycle(args.ref);

  // The proposed Registry identity travels with the step as structured data,
  // so trust classification compares bindings rather than reading warnings.
  const registryBinding: RegistryBindingProposal | undefined =
    args.ref.refType === "registry"
      ? {
          extensionType: args.ref.type,
          target: target.name,
          owner: args.ref.owner,
          packageName: args.ref.name,
          version: args.ref.version,
          publisherBindingId: args.ref.publisherBindingId,
        }
      : undefined;
  const base = {
    key: toStepKey(target),
    label: toLabelWithCompanions(target, companionPkgs),
    run: runInstallOperation(manager, args),
    ...(registryLifecycle === undefined ? {} : { registryLifecycle }),
    ...(registryBinding === undefined ? {} : { registryBinding }),
  };
  return lifecycleWarnings.length === 0
    ? ({ ...base, readiness: "ready" } satisfies PlannedJobStep<R | RecipeRequirements>)
    : ({
        ...base,
        readiness: "warn",
        warnMessage: lifecycleWarnings.join("; "),
      } satisfies PlannedJobStep<R | RecipeRequirements>);
};

/**
 * Build a PlannedJobStep for `new` commands.
 *
 * A read-only preflight runs first. The transaction then snapshots the source
 * path, scaffolds it, seeds desired state, resolves the canonical package, and
 * materializes projections before validating the authored postcondition.
 */
export const buildAuthoredExtensionStep = <
  TRef extends ExtensionRef,
  TMaterialization extends MaterializationFacts,
  F = never,
  R = never,
>(
  manager: ExtensionManager<TRef, TMaterialization, R>,
  args: AuthoredExtensionOperationArgs<TRef, TMaterialization, F, R>,
): PlannedJobStep<R | RecipeRequirements> => {
  const target = args.target;

  return {
    key: toStepKey(target),
    label: args.label ?? toLabel(target),
    readiness: "ready",
    ...(args.plannedArtifact === undefined ? {} : { artifact: args.plannedArtifact }),
    run: (args.allowConfiguredSourceTransition === true
      ? Effect.void
      : manager.listMaterializable()
    ).pipe(
      Effect.andThen(
        runWorkspaceTransaction({
          targets: Array.from(new Set([args.location, ...(args.transactionTargets ?? [])])).sort(),
          transition: Effect.gen(function* () {
            if (args.preflight !== undefined) yield* args.preflight;
            yield* args.scaffold;
            yield* args.markAuthored;
            const materializable = yield* manager.listMaterializable();
            const ref = materializable.find(
              (candidate) => toStepKey(targetFromRef(candidate)) === toStepKey(target),
            );
            if (ref === undefined) {
              return yield* new ScaffoldedExtensionUnresolved({
                targetType: target.type,
                targetName: target.name,
              });
            }
            const installedBefore =
              args.installedBefore === undefined ? false : yield* args.installedBefore;
            let materialization = Option.none<TMaterialization>();
            if (args.enabled !== false || args.materializeWhenDisabled === true) {
              materialization =
                args.materializeInstall === undefined
                  ? Option.some(yield* manager.materializeInstall({ ref }))
                  : yield* args.materializeInstall(ref);
            }
            yield* manager.upsertSettingsEntry({
              ref,
              versionRange: args.versionRange,
              materialization,
            });
            if (args.finalizeAuthored !== undefined) {
              yield* args.finalizeAuthored;
            }
            if (args.enabled === false && args.materializeWhenDisabled === true) {
              yield* manager.materializeDeactivate({ target });
            } else if (args.enabled !== false) {
              // Desired state is committed; render shared aggregate units once
              // from the complete contributor set.
              return {
                ref,
                installedBefore,
                materialization,
                projectionWarnings: yield* applyManagerProjectionPlans(manager),
              };
            }
            return {
              ref,
              installedBefore,
              materialization,
              projectionWarnings: NO_PROJECTION_WARNINGS,
            };
          }),
          validate: () =>
            Effect.gen(function* () {
              const installed = yield* manager.isInstalled({ target });
              if (args.enabled !== false && !installed) {
                return yield* new LifecyclePostconditionViolated({
                  postcondition: "new-observable",
                  targetType: target.type,
                  targetName: target.name,
                });
              }
              if (manager.getConfiguredSource !== undefined) {
                const configured = yield* manager.getConfiguredSource({ target });
                if (Option.isNone(configured)) {
                  return yield* new LifecyclePostconditionViolated({
                    postcondition: "new-declared",
                    targetType: target.type,
                    targetName: target.name,
                  });
                }
              }
            }),
        }),
      ),
      Effect.flatMap(({ installedBefore, materialization }) =>
        Effect.gen(function* () {
          const artifact =
            args.buildArtifact === undefined
              ? undefined
              : yield* args.buildArtifact({ installedBefore, materialization });
          return {
            result: "success" as const,
            message: args.message,
            ...(artifact === undefined ? {} : { artifact }),
          } satisfies JobStepResult;
        }),
      ),
      Effect.mapError(args.toStepFailure),
    ),
  } satisfies PlannedJobStep<R | RecipeRequirements>;
};

/**
 * Build a PlannedJobStep for existing `new` commands.
 *
 * New commands remain enabled by default while sharing the authored-package
 * transaction used by fork and native import.
 */
export const buildNewExtensionStep = <
  TRef extends ExtensionRef,
  TMaterialization extends MaterializationFacts,
  F = never,
  R = never,
>(
  manager: ExtensionManager<TRef, TMaterialization, R>,
  args: NewExtensionOperationArgs<TRef, TMaterialization, F, R>,
): PlannedJobStep<R | RecipeRequirements> => {
  if (args.ref.refType !== "workspace") {
    return {
      key: toStepKey(args.target),
      label: args.label ?? toLabel(args.target),
      readiness: "error",
      errorMessage: "New authored extensions require a workspace source",
    };
  }
  return buildAuthoredExtensionStep(manager, {
    ...args,
    location: args.ref.location,
    enabled: true,
  });
};

// -----------------------------------------------------------------------------
// Materialize Operation
// -----------------------------------------------------------------------------

export interface MaterializeOperationArgs<
  TRef extends ExtensionRef,
  TMaterialization extends MaterializationFacts,
  F = never,
  R = never,
> extends StepFailureAdapter<F> {
  readonly ref: TRef;
  /** Optional transition-rich label used by reconciliation previews. */
  readonly label?: string;
  /** Explicitly permit a workspace-authored relocation during reconciliation. */
  readonly allowWorkspaceSourceTransition?: boolean;
  /** Reacquire canonical content before projecting it. */
  readonly force?: boolean;
  /** Verify realized content inside the transaction before recording its resolution. */
  readonly validateMaterialized?: (args: {
    readonly materialization: TMaterialization;
  }) => Effect.Effect<void, CallerStepFailure<F>, R>;
  readonly buildArtifact?: (args: {
    readonly materialization: TMaterialization;
  }) => Effect.Effect<JobStepArtifact, CallerStepFailure<F>, R>;
  readonly message?: string;
}

const runMaterializeOperation = <
  TRef extends ExtensionRef,
  TMaterialization extends MaterializationFacts,
  F,
  R,
>(
  manager: ExtensionManager<TRef, TMaterialization, R>,
  args: MaterializeOperationArgs<TRef, TMaterialization, F, R>,
): Effect.Effect<JobStepResult, StepFailure, R | RecipeRequirements> =>
  Effect.gen(function* () {
    const target = targetFromRef(args.ref);
    const materialization = yield* runWorkspaceTransaction({
      transition: Effect.gen(function* () {
        const observed = yield* manager.materializeInstall({
          ref: args.ref,
          ...(args.force === undefined ? {} : { force: args.force }),
        });
        if (args.validateMaterialized !== undefined) {
          yield* args.validateMaterialized({ materialization: observed });
        }
        yield* manager.upsertLockfileEntry({
          ref: args.ref,
          materialization: Option.some(observed),
        });
        return observed;
      }),
      validate: () =>
        manager.isInstalled({ target }).pipe(
          Effect.flatMap((installed) =>
            installed
              ? Effect.void
              : new LifecyclePostconditionViolated({
                  postcondition: "materialize-observable",
                  targetType: target.type,
                  targetName: target.name,
                }),
          ),
        ),
    });
    const artifact =
      args.buildArtifact === undefined ? undefined : yield* args.buildArtifact({ materialization });
    return {
      result: "success" as const,
      message: args.message ?? "Synced agent artifacts",
      ...(artifact === undefined ? {} : { artifact }),
    } satisfies JobStepResult;
  }).pipe(Effect.mapError(args.toStepFailure));

export const buildMaterializeOperation = <
  TRef extends ExtensionRef,
  TMaterialization extends MaterializationFacts,
  F = never,
  R = never,
>(
  manager: ExtensionManager<TRef, TMaterialization, R>,
  args: MaterializeOperationArgs<TRef, TMaterialization, F, R>,
): PlannedJobStep<R | RecipeRequirements> => {
  const target = targetFromRef(args.ref);
  const companionPkgs = args.ref.refType === "registry" ? args.ref.packages : [];

  return {
    key: toStepKey(target),
    label: args.label ?? toLabelWithCompanions(target, companionPkgs),
    readiness: "ready",
    run: runMaterializeOperation(manager, args),
  } satisfies PlannedJobStep<R | RecipeRequirements>;
};

// -----------------------------------------------------------------------------
// Uninstall Operation
// -----------------------------------------------------------------------------

export interface UninstallOperationArgs<
  TRef extends ExtensionRef,
  TMaterialization extends MaterializationFacts,
  F = never,
  R = never,
> extends StepFailureAdapter<F> {
  readonly target: ExtensionTargetFor<TRef>;
  /**
   * When true, skip the trailing shared-projection reconcile (e.g. pack
   * dependency steps, whose closure runs one projection write at the end).
   */
  readonly skipProjections?: boolean;
  /**
   * Declares that the target's canonical package could not be read. Uninstall
   * then removes the target's configuration and accepted resolution only, and
   * preserves canonical content it cannot verify.
   */
  readonly retirement?: UnreadablePackageRetirement;
  /** Presenter metadata computed from what the removal settled and withdrew. */
  readonly buildArtifact?: (args: {
    readonly settlement: UninstallSettlement;
    readonly unmaterialization: Option.Option<TMaterialization>;
  }) => Effect.Effect<JobStepArtifact, CallerStepFailure<F>, R>;
}

/** Why an uninstall target's canonical package could not be read. */
export interface UnreadablePackageRetirement {
  /** Workspace path where the unreadable manifest was looked for. */
  readonly manifestPath: string;
  readonly reason: "missing" | "invalid";
}

/** What an uninstall settled: the declaration, and the canonical content. */
export interface UninstallSettlement {
  readonly declaration: "removed" | "absent";
  readonly canonical:
    | "removed"
    | "absent"
    | "retained-by-pack"
    | "preserved-authored"
    | "preserved-unowned"
    | "preserved-unreadable";
}

const uninstallSettlementMessage = (
  target: ExtensionTarget,
  settlement: UninstallSettlement,
): string => {
  const label = toLabel(target);
  if (settlement.declaration === "absent" && settlement.canonical === "absent") {
    return `${label} is already absent`;
  }
  switch (settlement.canonical) {
    case "absent":
      return `Unconfigured ${label}; no canonical package was present`;
    case "removed":
      return `Removed ${label}`;
    case "retained-by-pack":
      return `Unconfigured ${label}; retained its package because an installed pack still requires it`;
    case "preserved-authored":
      return `Unconfigured ${label}; preserved its workspace-authored source`;
    case "preserved-unowned":
      return `Unconfigured ${label}; preserved canonical content without an accepted source owner`;
    case "preserved-unreadable":
      return `Unconfigured ${label}; preserved its package because its manifest could not be read`;
  }
};

/**
 * Plain-language account of a registration-only removal: what was retired, why
 * its content could not be verified, what was left in place, and what the
 * operator can do about the remainder.
 */
const unreadablePackageWarning = (
  target: ExtensionTarget,
  retirement: UnreadablePackageRetirement,
): string =>
  `${toLabel(target)}: its package manifest ${retirement.reason === "missing" ? "is missing" : "cannot be read"} at ${retirement.manifestPath}, so AXM removed its configuration entry and accepted resolution and left its package content in place. Delete that content yourself once you no longer need it.`;

/**
 * Execute the uninstall sequence with retention check.
 *
 * If the target is still required by an installed pack:
 *   1. Remove settings entry
 *
 * If not required:
 *   1. Unmaterialize from disk
 *   2. Remove lockfile entry
 *   3. Remove settings entry
 */
const runUninstallOperation = <
  TRef extends ExtensionRef,
  TMaterialization extends MaterializationFacts,
  F,
  R,
>(
  manager: ExtensionManager<TRef, TMaterialization, R>,
  retentionPolicy: UninstallRetentionPolicy<F, R>,
  args: UninstallOperationArgs<TRef, TMaterialization, F, R>,
): Effect.Effect<JobStepResult, StepFailure, R | RecipeRequirements> =>
  Effect.gen(function* () {
    const configuredSource =
      manager.getConfiguredSource === undefined
        ? Option.none<string>()
        : yield* manager.getConfiguredSource({ target: args.target });
    const configured = yield* isConfigured(manager, args.target);
    const transition = Effect.gen(function* () {
      const applyProjections = () =>
        args.skipProjections !== true
          ? applyManagerProjectionPlans(manager)
          : Effect.succeed(NO_PROJECTION_WARNINGS);

      if (args.retirement !== undefined) {
        // Nothing about the package can be verified, so only the registration
        // AXM itself wrote is removable. Canonical content stays untouched.
        yield* manager.removeSettingsEntry({
          target: args.target,
          materialization: Option.none(),
        });
        yield* manager.removeLockfileEntry({
          target: args.target,
          materialization: Option.none(),
        });
        return {
          settlement: {
            declaration: "removed",
            canonical: "preserved-unreadable",
          } satisfies UninstallSettlement,
          unmaterialization: Option.none<TMaterialization>(),
          expectedInstalled: undefined,
          projectionWarnings: yield* applyProjections(),
        };
      }

      const isInstalled = yield* manager.isInstalled({ target: args.target });
      if (!isInstalled) {
        if (configured) {
          // Configured extensions may still own native agent projections even
          // when they have no canonical managed package on disk.
          const withdrawn = yield* manager.materializeUninstall({ target: args.target });
          const unmaterialization = Option.some(withdrawn);
          yield* manager.removeSettingsEntry({
            target: args.target,
            materialization: unmaterialization,
          });
          yield* manager.removeLockfileEntry({
            target: args.target,
            materialization: unmaterialization,
          });
          return {
            settlement: {
              declaration: "removed",
              canonical: "absent",
            } satisfies UninstallSettlement,
            unmaterialization,
            expectedInstalled: false,
            projectionWarnings: yield* applyProjections(),
          };
        }
        return {
          settlement: {
            declaration: "absent",
            canonical: "absent",
          } satisfies UninstallSettlement,
          unmaterialization: Option.none<TMaterialization>(),
          expectedInstalled: false,
          projectionWarnings: NO_PROJECTION_WARNINGS,
        };
      }

      const stillRequiredByPack = yield* retentionPolicy.isRequiredByInstalledPack({
        target: args.target,
      });
      if (stillRequiredByPack) {
        yield* manager.removeSettingsEntry({ target: args.target, materialization: Option.none() });
        return {
          settlement: {
            declaration: "removed",
            canonical: "retained-by-pack",
          } satisfies UninstallSettlement,
          unmaterialization: Option.none<TMaterialization>(),
          expectedInstalled: true,
          projectionWarnings: yield* applyProjections(),
        };
      }

      const unmaterialization = Option.some(
        yield* manager.materializeUninstall({ target: args.target }),
      );
      yield* manager.removeSettingsEntry({
        target: args.target,
        materialization: unmaterialization,
      });
      yield* manager.removeLockfileEntry({
        target: args.target,
        materialization: unmaterialization,
      });
      // The target has left the desired-state graph; re-render every shared
      // aggregate unit once so only reachable contributors remain.
      const projectionWarnings = yield* applyProjections();
      return {
        projectionWarnings,
        unmaterialization,
        settlement: {
          declaration: "removed" as const,
          canonical: Option.match(configuredSource, {
            onNone: () => "preserved-unowned" as const,
            onSome: (source) =>
              isWorkspaceSourceLocator(source)
                ? ("preserved-authored" as const)
                : ("removed" as const),
          }),
        } satisfies UninstallSettlement,
        expectedInstalled: Option.match(configuredSource, {
          onNone: () => undefined,
          onSome: (source) => (isWorkspaceSourceLocator(source) ? undefined : false),
        }),
      };
    });

    const result = yield* runWorkspaceTransaction({
      transition,
      validate: (outcome) =>
        Effect.gen(function* () {
          if (manager.isConfigured !== undefined || manager.getConfiguredSource !== undefined) {
            const remainsConfigured = yield* isConfigured(manager, args.target);
            if (remainsConfigured) {
              return yield* new LifecyclePostconditionViolated({
                postcondition: "uninstall-remains-declared",
                targetType: args.target.type,
                targetName: args.target.name,
              });
            }
          }
          const installed = yield* manager.isInstalled({ target: args.target });
          if (outcome.expectedInstalled !== undefined && installed !== outcome.expectedInstalled) {
            return yield* new LifecyclePostconditionViolated({
              postcondition: "uninstall-observed-state",
              targetType: args.target.type,
              targetName: args.target.name,
            });
          }
        }),
    });
    const warnings = [
      ...(args.retirement === undefined
        ? []
        : [unreadablePackageWarning(args.target, args.retirement)]),
      ...result.projectionWarnings,
    ];
    const artifact =
      args.buildArtifact === undefined
        ? undefined
        : yield* args.buildArtifact({
            settlement: result.settlement,
            unmaterialization: result.unmaterialization,
          });
    return {
      result: "success",
      message: uninstallSettlementMessage(args.target, result.settlement),
      ...(result.settlement.declaration === "absent" ? { disposition: "unchanged" as const } : {}),
      ...(artifact === undefined ? {} : { artifact }),
      ...(warnings.length === 0 ? {} : { warnings }),
    } satisfies JobStepResult;
  }).pipe(Effect.mapError(args.toStepFailure));

/**
 * Build a PlannedJobStep for an uninstall operation.
 *
 * The step keeps the manager's requirements and the transaction scope in its
 * `run` effect; the command boundary composes them once.
 */
export const buildUninstallOperation = <
  TRef extends ExtensionRef,
  TMaterialization extends MaterializationFacts,
  F = never,
  R = never,
>(
  manager: ExtensionManager<TRef, TMaterialization, R>,
  retentionPolicy: UninstallRetentionPolicy<F, R>,
  args: UninstallOperationArgs<TRef, TMaterialization, F, R>,
): PlannedJobStep<R | RecipeRequirements> => {
  return {
    label: toLabel(args.target),
    readiness: "ready",
    run: runUninstallOperation(manager, retentionPolicy, args),
  } satisfies PlannedJobStep<R | RecipeRequirements>;
};

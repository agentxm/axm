/**
 * Shared extension operation workflows — install and uninstall operation builders.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ExtensionManager } from "../extension-workspace/extension-manager.js";
import type { ExtensionManagerFailure } from "../extension-workspace/errors.js";
import {
  LifecyclePostconditionViolated,
  ScaffoldedExtensionUnresolved,
  SourceAuthorityBlocked,
} from "./errors.js";
import { applyProjectionPlans, projectionPlanExclusionWarnings } from "../projection/planning.js";
import type { StepFailure } from "@agentxm/workspace-operations";
import type { JobStepArtifact, JobStepResult, PlannedJobStep } from "@agentxm/workspace-operations";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { PackageUrlParts } from "@agentxm/extension-model/unstable/packaging/package-url";
import type { ExtensionTarget, ExtensionTargetFor } from "@agentxm/workspace-state";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import { evaluateSourceAuthority } from "./source-authority.js";
import { formatDeprecationWarning } from "./deprecation-warning.js";
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
// Uninstall Retention Policy Interface
// -----------------------------------------------------------------------------

/**
 * Cross-cutting uninstall dependency-retention policy.
 *
 * Captured from workspace service at plan-build time and passed to
 * runUninstallOperation. All methods have `R = never`.
 */
export interface UninstallRetentionPolicy<F = never> {
  readonly isRequiredByInstalledPack: (args: {
    readonly target: ExtensionTarget;
  }) => Effect.Effect<boolean, CallerStepFailure<F>, never>;
}

/**
 * Failure channel for caller-supplied step callbacks: the kernel's own manager
 * failures plus whatever failure family the calling feature or application
 * supplies through `F`.
 */
export type CallerStepFailure<F = never> = ExtensionManagerFailure | F;

/**
 * Caller-supplied serialization of every failure the built step can surface
 * into the plan-step vocabulary. The application boundary owns categories,
 * wording, and suggestions; the kernel only requires the mapping.
 */
export interface StepFailureAdapter<F = never> {
  readonly toStepFailure: (failure: CallerStepFailure<F>) => StepFailure;
}

const NO_PROJECTION_WARNINGS: ReadonlyArray<string> = [];

/**
 * Render the manager's shared aggregate units and return the operator-facing
 * report for every desired contributor those units could not render. The
 * report travels with the step that performed the render.
 */
const applyManagerProjectionPlans = <TRef extends ExtensionRef>(
  manager: ExtensionManager<TRef>,
): Effect.Effect<ReadonlyArray<string>, ExtensionManagerFailure> =>
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
  F = never,
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
  readonly installedBefore?: Effect.Effect<boolean, CallerStepFailure<F>, never>;
  /** Optional presenter metadata computed after materialization/settings writes. */
  readonly buildArtifact?: (args: {
    readonly installedBefore: boolean;
  }) => Effect.Effect<JobStepArtifact, CallerStepFailure<F>, never>;
  /** Optional outcome message for type-specific install presenters. */
  readonly message?: string;
  /** Explicit destructive source-authority transition used only by demotion. */
  readonly allowWorkspaceReplacement?: boolean;
}

export interface NewExtensionOperationArgs<TRef extends ExtensionRef, F = never> extends Omit<
  InstallOperationArgs<TRef, F>,
  "force" | "allowWorkspaceReplacement"
> {
  readonly target: ExtensionTargetFor<TRef>;
  /** Read-only artifact forecast rendered by preview before any mutation occurs. */
  readonly plannedArtifact?: JobStepArtifact;
  /** Collision checks repeated under the workspace transaction lock before the first write. */
  readonly preflight?: Effect.Effect<void, CallerStepFailure<F>, never>;
  readonly scaffold: Effect.Effect<unknown, CallerStepFailure<F>, never>;
  readonly markAuthored: Effect.Effect<void, CallerStepFailure<F>, never>;
  readonly message: string;
  readonly label?: string;
}

export interface AuthoredExtensionOperationArgs<TRef extends ExtensionRef, F = never> extends Omit<
  NewExtensionOperationArgs<TRef, F>,
  "ref"
> {
  /** Canonical workspace package path protected by the transaction snapshot. */
  readonly location: string;
  /** Additional files that the authored transition may update transactionally. */
  readonly transactionTargets?: ReadonlyArray<string>;
  /** Whether the new authored extension should remain materialized after creation. */
  readonly enabled?: boolean;
  /** Commit the caller's final desired-state shape after canonical resolution. */
  readonly finalizeAuthored?: Effect.Effect<void, CallerStepFailure<F>, never>;
  /** Type-specific projection path for authored packages with specialized installers. */
  readonly materializeInstall?: (ref: TRef) => Effect.Effect<void, CallerStepFailure<F>, never>;
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

const isConfigured = <TRef extends ExtensionRef>(
  manager: ExtensionManager<TRef>,
  target: ExtensionTarget,
): Effect.Effect<boolean, ExtensionManagerFailure, never> => {
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
const runInstallOperation = <TRef extends ExtensionRef, F>(
  manager: ExtensionManager<TRef>,
  args: InstallOperationArgs<TRef, F>,
): Effect.Effect<JobStepResult, StepFailure, never> =>
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
    const transaction = yield* manager.runTransaction({
      transition: Effect.gen(function* () {
        const cleanupSupersededCanonical =
          manager.prepareSourceTransition === undefined
            ? Effect.void
            : yield* manager.prepareSourceTransition({ ref: args.ref });
        yield* manager.materializeInstall({
          ref: args.ref,
          ...(args.force === undefined ? {} : { force: args.force }),
        });
        if (!args.skipSettings) {
          yield* manager.upsertSettingsEntry({
            ref: args.ref,
            versionRange: args.versionRange,
          });
        }
        yield* manager.upsertLockfileEntry({ ref: args.ref });
        yield* cleanupSupersededCanonical;
        // Desired state and canonical content are committed; render every
        // shared aggregate unit once from the complete contributor set.
        const projectionWarnings =
          args.skipProjections !== true
            ? yield* applyManagerProjectionPlans(manager)
            : NO_PROJECTION_WARNINGS;
        return { installedBefore, projectionWarnings };
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
      args.buildArtifact === undefined ? undefined : yield* args.buildArtifact({ installedBefore });
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
 * The step captures the manager and args in its `run` closure so execution
 * requires no runtime service resolution (`R = never`).
 */
export const buildInstallOperation = <TRef extends ExtensionRef, F = never>(
  manager: ExtensionManager<TRef>,
  args: InstallOperationArgs<TRef, F>,
): PlannedJobStep => {
  const target = targetFromRef(args.ref);
  const companionPkgs = args.ref.refType === "registry" ? args.ref.packages : [];
  const lifecycleWarnings = extensionRefLifecycleWarnings(args.ref);
  const registryLifecycle = extensionRefRegistryLifecycle(args.ref);

  const base = {
    key: toStepKey(target),
    label: toLabelWithCompanions(target, companionPkgs),
    run: runInstallOperation(manager, args),
    ...(registryLifecycle === undefined ? {} : { registryLifecycle }),
  };
  return lifecycleWarnings.length === 0
    ? ({ ...base, readiness: "ready" } satisfies PlannedJobStep)
    : ({
        ...base,
        readiness: "warn",
        warnMessage: lifecycleWarnings.join("; "),
      } satisfies PlannedJobStep);
};

/**
 * Build a PlannedJobStep for `new` commands.
 *
 * A read-only preflight runs first. The transaction then snapshots the source
 * path, scaffolds it, seeds desired state, resolves the canonical package, and
 * materializes projections before validating the authored postcondition.
 */
export const buildAuthoredExtensionStep = <TRef extends ExtensionRef, F = never>(
  manager: ExtensionManager<TRef>,
  args: AuthoredExtensionOperationArgs<TRef, F>,
): PlannedJobStep => {
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
        manager.runTransaction({
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
            if (args.enabled !== false || args.materializeWhenDisabled === true) {
              if (args.materializeInstall === undefined) {
                yield* manager.materializeInstall({ ref });
              } else {
                yield* args.materializeInstall(ref);
              }
            }
            yield* manager.upsertSettingsEntry({ ref, versionRange: args.versionRange });
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
                projectionWarnings: yield* applyManagerProjectionPlans(manager),
              };
            }
            return { ref, installedBefore, projectionWarnings: NO_PROJECTION_WARNINGS };
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
      Effect.flatMap(({ installedBefore }) =>
        Effect.gen(function* () {
          const artifact =
            args.buildArtifact === undefined
              ? undefined
              : yield* args.buildArtifact({ installedBefore });
          return {
            result: "success" as const,
            message: args.message,
            ...(artifact === undefined ? {} : { artifact }),
          } satisfies JobStepResult;
        }),
      ),
      Effect.mapError(args.toStepFailure),
    ),
  } satisfies PlannedJobStep;
};

/**
 * Build a PlannedJobStep for existing `new` commands.
 *
 * New commands remain enabled by default while sharing the authored-package
 * transaction used by fork and native import.
 */
export const buildNewExtensionStep = <TRef extends ExtensionRef, F = never>(
  manager: ExtensionManager<TRef>,
  args: NewExtensionOperationArgs<TRef, F>,
): PlannedJobStep => {
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
  F = never,
> extends StepFailureAdapter<F> {
  readonly ref: TRef;
  /** Optional transition-rich label used by reconciliation previews. */
  readonly label?: string;
  /** Explicitly permit a workspace-authored relocation during reconciliation. */
  readonly allowWorkspaceSourceTransition?: boolean;
  /** Reacquire canonical content before projecting it. */
  readonly force?: boolean;
  readonly buildArtifact?: () => Effect.Effect<JobStepArtifact, CallerStepFailure<F>, never>;
  readonly message?: string;
}

const runMaterializeOperation = <TRef extends ExtensionRef, F>(
  manager: ExtensionManager<TRef>,
  args: MaterializeOperationArgs<TRef, F>,
): Effect.Effect<JobStepResult, StepFailure, never> =>
  Effect.gen(function* () {
    const target = targetFromRef(args.ref);
    yield* manager.runTransaction({
      transition: Effect.gen(function* () {
        yield* manager.materializeInstall({
          ref: args.ref,
          ...(args.force === undefined ? {} : { force: args.force }),
        });
        yield* manager.upsertLockfileEntry({ ref: args.ref });
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
    const artifact = args.buildArtifact === undefined ? undefined : yield* args.buildArtifact();
    return {
      result: "success" as const,
      message: args.message ?? "Synced agent artifacts",
      ...(artifact === undefined ? {} : { artifact }),
    } satisfies JobStepResult;
  }).pipe(Effect.mapError(args.toStepFailure));

export const buildMaterializeOperation = <TRef extends ExtensionRef, F = never>(
  manager: ExtensionManager<TRef>,
  args: MaterializeOperationArgs<TRef, F>,
): PlannedJobStep => {
  const target = targetFromRef(args.ref);
  const companionPkgs = args.ref.refType === "registry" ? args.ref.packages : [];

  return {
    key: toStepKey(target),
    label: args.label ?? toLabelWithCompanions(target, companionPkgs),
    readiness: "ready",
    run: runMaterializeOperation(manager, args),
  } satisfies PlannedJobStep;
};

// -----------------------------------------------------------------------------
// Uninstall Operation
// -----------------------------------------------------------------------------

export interface UninstallOperationArgs<
  TRef extends ExtensionRef,
  F = never,
> extends StepFailureAdapter<F> {
  readonly target: ExtensionTargetFor<TRef>;
  /**
   * When true, skip the trailing shared-projection reconcile (e.g. pack
   * dependency steps, whose closure runs one projection write at the end).
   */
  readonly skipProjections?: boolean;
}

type UninstallSettlement = {
  readonly declaration: "removed" | "absent";
  readonly canonical:
    "removed" | "absent" | "retained-by-pack" | "preserved-authored" | "preserved-unowned";
};

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
  }
};

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
const runUninstallOperation = <TRef extends ExtensionRef, F>(
  manager: ExtensionManager<TRef>,
  retentionPolicy: UninstallRetentionPolicy<F>,
  args: UninstallOperationArgs<TRef, F>,
): Effect.Effect<JobStepResult, StepFailure, never> =>
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

      const isInstalled = yield* manager.isInstalled({ target: args.target });
      if (!isInstalled) {
        if (configured) {
          // Configured extensions may still own native agent projections even
          // when they have no canonical managed package on disk.
          yield* manager.materializeUninstall({ target: args.target });
          yield* manager.removeSettingsEntry({ target: args.target });
          yield* manager.removeLockfileEntry({ target: args.target });
          return {
            settlement: { declaration: "removed", canonical: "absent" } as const,
            expectedInstalled: false,
            projectionWarnings: yield* applyProjections(),
          };
        }
        return {
          settlement: { declaration: "absent", canonical: "absent" } as const,
          expectedInstalled: false,
          projectionWarnings: NO_PROJECTION_WARNINGS,
        };
      }

      const stillRequiredByPack = yield* retentionPolicy.isRequiredByInstalledPack({
        target: args.target,
      });
      if (stillRequiredByPack) {
        yield* manager.removeSettingsEntry({ target: args.target });
        return {
          settlement: { declaration: "removed", canonical: "retained-by-pack" } as const,
          expectedInstalled: true,
          projectionWarnings: yield* applyProjections(),
        };
      }

      yield* manager.materializeUninstall({ target: args.target });
      yield* manager.removeSettingsEntry({ target: args.target });
      yield* manager.removeLockfileEntry({ target: args.target });
      // The target has left the desired-state graph; re-render every shared
      // aggregate unit once so only reachable contributors remain.
      const projectionWarnings = yield* applyProjections();
      return {
        projectionWarnings,
        settlement: {
          declaration: "removed" as const,
          canonical: Option.match(configuredSource, {
            onNone: () => "preserved-unowned" as const,
            onSome: (source) =>
              isWorkspaceSourceLocator(source)
                ? ("preserved-authored" as const)
                : ("removed" as const),
          }),
        },
        expectedInstalled: Option.match(configuredSource, {
          onNone: () => undefined,
          onSome: (source) => (isWorkspaceSourceLocator(source) ? undefined : false),
        }),
      };
    });

    const result = yield* manager.runTransaction({
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
    return {
      result: "success",
      message: uninstallSettlementMessage(args.target, result.settlement),
      ...(result.settlement.declaration === "absent" ? { disposition: "unchanged" as const } : {}),
      ...(result.projectionWarnings.length === 0 ? {} : { warnings: result.projectionWarnings }),
    } satisfies JobStepResult;
  }).pipe(Effect.mapError(args.toStepFailure));

/**
 * Build a PlannedJobStep for an uninstall operation.
 *
 * The step captures the manager, retention policy, and target in its `run`
 * closure so execution requires no runtime service resolution (`R = never`).
 */
export const buildUninstallOperation = <TRef extends ExtensionRef, F = never>(
  manager: ExtensionManager<TRef>,
  retentionPolicy: UninstallRetentionPolicy<F>,
  args: UninstallOperationArgs<TRef, F>,
): PlannedJobStep => {
  return {
    label: toLabel(args.target),
    readiness: "ready",
    run: runUninstallOperation(manager, retentionPolicy, args),
  } satisfies PlannedJobStep;
};

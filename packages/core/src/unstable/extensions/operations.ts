/**
 * Shared extension operation workflows — install and uninstall operation builders.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError, type AppError } from "../app-error/index.js";
import type { JobStepArtifact, JobStepResult, PlannedJobStep } from "../plan/plan.js";
import type { ExtensionRef } from "./refs.js";
import type { PackageUrlParts } from "../packaging/package-url.js";
import type {
  ExtensionManager,
  ExtensionTarget,
  ExtensionTargetFor,
} from "../workspace/service-interface.js";
import { isWorkspaceSourceLocator } from "../sources/workspace.js";
import { evaluateSourceAuthority } from "./source-authority.js";

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
export interface UninstallRetentionPolicy {
  readonly isRequiredByInstalledPack: (args: {
    readonly target: ExtensionTarget;
  }) => Effect.Effect<boolean, AppError, never>;
}

// -----------------------------------------------------------------------------
// Install Operation
// -----------------------------------------------------------------------------

export interface InstallOperationArgs<TRef extends ExtensionRef> {
  readonly ref: TRef;
  readonly versionRange: Option.Option<string>;
  /** When true, re-materialize unconditionally (repair path for forced reinstalls). */
  readonly force?: boolean;
  /** When true, skip writing to settings (e.g. pack dependency installs). */
  readonly skipSettings?: boolean;
  /** Optional pre-install state probe for artifact change labels. */
  readonly installedBefore?: Effect.Effect<boolean, AppError, never>;
  /** Optional presenter metadata computed after materialization/settings writes. */
  readonly buildArtifact?: (args: {
    readonly installedBefore: boolean;
  }) => Effect.Effect<JobStepArtifact, AppError, never>;
  /** Optional outcome message for type-specific install presenters. */
  readonly message?: string;
  /** Explicit destructive source-authority transition used only by demotion. */
  readonly allowWorkspaceReplacement?: boolean;
}

export interface NewExtensionOperationArgs<TRef extends ExtensionRef> extends Omit<
  InstallOperationArgs<TRef>,
  "force" | "allowWorkspaceReplacement"
> {
  readonly target: ExtensionTargetFor<TRef>;
  /** Read-only artifact forecast rendered by preview before any mutation occurs. */
  readonly plannedArtifact?: JobStepArtifact;
  /** Collision checks repeated under the workspace transaction lock before the first write. */
  readonly preflight?: Effect.Effect<void, AppError, never>;
  readonly scaffold: Effect.Effect<unknown, AppError, never>;
  readonly markAuthored: Effect.Effect<void, AppError, never>;
  readonly message: string;
  readonly label?: string;
}

export interface AuthoredExtensionOperationArgs<TRef extends ExtensionRef> extends Omit<
  NewExtensionOperationArgs<TRef>,
  "ref"
> {
  /** Canonical workspace package path protected by the transaction snapshot. */
  readonly location: string;
  /** Additional files that the authored transition may update transactionally. */
  readonly transactionTargets?: ReadonlyArray<string>;
  /** Whether the new authored extension should remain materialized after creation. */
  readonly enabled?: boolean;
  /** Commit the caller's final desired-state shape after canonical resolution. */
  readonly finalizeAuthored?: Effect.Effect<void, AppError, never>;
  /** Type-specific projection path for authored packages with specialized installers. */
  readonly materializeInstall?: (ref: TRef) => Effect.Effect<void, AppError, never>;
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

/**
 * Execute the canonical install sequence.
 *
 * Root installs materialize and commit desired state plus any accepted external
 * resolution before validating the observable postcondition. Pack-derived
 * installs omit the root settings declaration while retaining that resolution.
 */
const runInstallOperation = <TRef extends ExtensionRef>(
  manager: ExtensionManager<TRef>,
  args: InstallOperationArgs<TRef>,
): Effect.Effect<JobStepResult, AppError, never> =>
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
      return yield* makeAppError({
        code: "conflict",
        detail: authority.fact.detail,
        suggestions: authority.fact.recovery,
      });
    }
    const installedBefore =
      args.installedBefore === undefined ? false : yield* args.installedBefore;
    yield* manager.runTransaction({
      transition: Effect.gen(function* () {
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
        return installedBefore;
      }),
      validate: () =>
        Effect.gen(function* () {
          const installed = yield* manager.isInstalled({ target });
          if (!installed) {
            return yield* makeAppError({
              code: "internal",
              detail: `Installed ${target.type} "${target.name}" did not satisfy its observable contract`,
            });
          }
          if (args.skipSettings !== true && manager.getConfiguredSource !== undefined) {
            const configured = yield* manager.getConfiguredSource({ target });
            if (Option.isNone(configured)) {
              return yield* makeAppError({
                code: "internal",
                detail: `Installed ${target.type} "${target.name}" has no desired-state declaration`,
              });
            }
          }
        }),
    });
    const artifact =
      args.buildArtifact === undefined ? undefined : yield* args.buildArtifact({ installedBefore });
    return {
      result: "success" as const,
      message: args.message ?? "Applied install operation",
      ...(artifact === undefined ? {} : { artifact }),
    } satisfies JobStepResult;
  });

/**
 * Build a PlannedJobStep for an install operation.
 *
 * The step captures the manager and args in its `run` closure so execution
 * requires no runtime service resolution (`R = never`).
 */
export const buildInstallOperation = <TRef extends ExtensionRef>(
  manager: ExtensionManager<TRef>,
  args: InstallOperationArgs<TRef>,
): PlannedJobStep => {
  const target = targetFromRef(args.ref);
  const companionPkgs = args.ref.refType === "registry" ? args.ref.packages : [];
  const lifecycleWarnings =
    args.ref.refType === "registry" ? (args.ref.lifecycleWarnings ?? []) : [];

  const base = {
    key: toStepKey(target),
    label: toLabelWithCompanions(target, companionPkgs),
    run: runInstallOperation(manager, args),
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
export const buildAuthoredExtensionStep = <TRef extends ExtensionRef>(
  manager: ExtensionManager<TRef>,
  args: AuthoredExtensionOperationArgs<TRef>,
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
              return yield* makeAppError({
                code: "not_found",
                detail: `Newly scaffolded ${target.type} "${target.name}" could not be resolved from its workspace source`,
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
            }
            return { ref, installedBefore };
          }),
          validate: () =>
            Effect.gen(function* () {
              const installed = yield* manager.isInstalled({ target });
              if (args.enabled !== false && !installed) {
                return yield* makeAppError({
                  code: "internal",
                  detail: `New ${target.type} "${target.name}" did not satisfy its observable contract`,
                });
              }
              if (manager.getConfiguredSource !== undefined) {
                const configured = yield* manager.getConfiguredSource({ target });
                if (Option.isNone(configured)) {
                  return yield* makeAppError({
                    code: "internal",
                    detail: `New ${target.type} "${target.name}" has no desired-state declaration`,
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
    ),
  } satisfies PlannedJobStep;
};

/**
 * Build a PlannedJobStep for existing `new` commands.
 *
 * New commands remain enabled by default while sharing the authored-package
 * transaction used by fork and native import.
 */
export const buildNewExtensionStep = <TRef extends ExtensionRef>(
  manager: ExtensionManager<TRef>,
  args: NewExtensionOperationArgs<TRef>,
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

export interface MaterializeOperationArgs<TRef extends ExtensionRef> {
  readonly ref: TRef;
  /** Optional transition-rich label used by reconciliation previews. */
  readonly label?: string;
  /** Explicitly permit a workspace-authored relocation during reconciliation. */
  readonly allowWorkspaceSourceTransition?: boolean;
  /** Reacquire canonical content before projecting it. */
  readonly force?: boolean;
  readonly buildArtifact?: () => Effect.Effect<JobStepArtifact, AppError, never>;
  readonly message?: string;
}

const runMaterializeOperation = <TRef extends ExtensionRef>(
  manager: ExtensionManager<TRef>,
  args: MaterializeOperationArgs<TRef>,
): Effect.Effect<JobStepResult, AppError, never> =>
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
              : makeAppError({
                  code: "internal",
                  detail: `Reconciled ${target.type} "${target.name}" did not satisfy its observable contract`,
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
  });

export const buildMaterializeOperation = <TRef extends ExtensionRef>(
  manager: ExtensionManager<TRef>,
  args: MaterializeOperationArgs<TRef>,
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

export interface UninstallOperationArgs<TRef extends ExtensionRef> {
  readonly target: ExtensionTargetFor<TRef>;
}

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
const runUninstallOperation = <TRef extends ExtensionRef>(
  manager: ExtensionManager<TRef>,
  retentionPolicy: UninstallRetentionPolicy,
  args: UninstallOperationArgs<TRef>,
): Effect.Effect<JobStepResult, AppError, never> =>
  Effect.gen(function* () {
    const configuredSource =
      manager.getConfiguredSource === undefined
        ? Option.none<string>()
        : yield* manager.getConfiguredSource({ target: args.target });
    const transition = Effect.gen(function* () {
      const isInstalled = yield* manager.isInstalled({ target: args.target });
      if (!isInstalled) {
        if (Option.isSome(configuredSource)) {
          yield* manager.removeSettingsEntry({ target: args.target });
          yield* manager.removeLockfileEntry({ target: args.target });
          return {
            job: {
              result: "success" as const,
              message: `Removed configured ${toLabel(args.target)}; no installed artifacts were observed`,
            } satisfies JobStepResult,
            expectedInstalled: false,
          };
        }
        return {
          job: { result: "success" as const, message: "not installed" } satisfies JobStepResult,
          expectedInstalled: false,
        };
      }

      const stillRequiredByPack = yield* retentionPolicy.isRequiredByInstalledPack({
        target: args.target,
      });
      if (stillRequiredByPack) {
        yield* manager.removeSettingsEntry({ target: args.target });
        return {
          job: {
            result: "success" as const,
            message: "Kept on disk because dependency is still required by an installed pack",
          } satisfies JobStepResult,
          expectedInstalled: true,
        };
      }

      yield* manager.materializeUninstall({ target: args.target });
      yield* manager.removeSettingsEntry({ target: args.target });
      yield* manager.removeLockfileEntry({ target: args.target });
      return {
        job: {
          result: "success" as const,
          message: `Removed ${toLabel(args.target)}`,
        } satisfies JobStepResult,
        expectedInstalled: false,
      };
    });

    const result = yield* manager.runTransaction({
      transition,
      validate: (outcome) =>
        Effect.gen(function* () {
          if (manager.getConfiguredSource !== undefined) {
            const configured = yield* manager.getConfiguredSource({ target: args.target });
            if (Option.isSome(configured)) {
              return yield* makeAppError({
                code: "internal",
                detail: `Uninstalled ${args.target.type} "${args.target.name}" remains declared`,
              });
            }
          }
          const installed = yield* manager.isInstalled({ target: args.target });
          if (installed !== outcome.expectedInstalled) {
            return yield* makeAppError({
              code: "internal",
              detail: `Uninstalled ${args.target.type} "${args.target.name}" has an invalid observed postcondition`,
            });
          }
        }),
    });
    return result.job;
  });

/**
 * Build a PlannedJobStep for an uninstall operation.
 *
 * The step captures the manager, retention policy, and target in its `run`
 * closure so execution requires no runtime service resolution (`R = never`).
 */
export const buildUninstallOperation = <TRef extends ExtensionRef>(
  manager: ExtensionManager<TRef>,
  retentionPolicy: UninstallRetentionPolicy,
  args: UninstallOperationArgs<TRef>,
): PlannedJobStep => {
  return {
    label: toLabel(args.target),
    readiness: "ready",
    run: runUninstallOperation(manager, retentionPolicy, args),
  } satisfies PlannedJobStep;
};

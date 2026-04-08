/**
 * Shared extension operation workflows — install and uninstall operation builders.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import type { AppError } from "../app-error/index.js";
import type { JobStepResult, PlannedJobStep } from "../workspace/plan.js";
import type { ExtensionRef } from "./refs.js";
import type { PackageUrlParts } from "../packaging/package-url.js";
import type {
  ExtensionManager,
  ExtensionTarget,
  ExtensionTargetFor,
} from "../workspace/service-interface.js";

// -----------------------------------------------------------------------------
// Target Helpers
// -----------------------------------------------------------------------------

/**
 * Derive an ExtensionTarget from an ExtensionRef.
 *
 * Pack targets include owner; skill/command/mcp-server targets are name-only.
 */
export const targetFromRef = (ref: ExtensionRef): ExtensionTarget => {
  switch (ref.type) {
    case "skill":
      return { type: "skill", name: ref.skill.name };
    case "pack":
      return { type: "pack", name: ref.pack.name, owner: ref.owner };
    case "command":
      return { type: "command", name: ref.command.name };
    case "mcp-server":
      return { type: "mcp-server", name: ref.server.name };
    case "subagent":
      return { type: "subagent", name: ref.subagent.name };
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
 * Build a display label with optional compatiblePackages suffix.
 *
 * When compatiblePackages is non-empty, appends them parenthesized:
 *   `code-review (pkg:npm/react, pkg:npm/typescript)`
 */
export const toLabelWithCompatibility = (
  target: ExtensionTarget,
  compatiblePackages: ReadonlyArray<PackageUrlParts>,
): string => {
  const base = toLabel(target);
  if (compatiblePackages.length === 0) return base;
  const purls = compatiblePackages.map(formatPackageUrlParts).join(", ");
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
  readonly markDependencyRetainedInLockfile: (args: {
    readonly target: ExtensionTarget;
  }) => Effect.Effect<void, AppError, never>;
}

// -----------------------------------------------------------------------------
// Install Operation
// -----------------------------------------------------------------------------

export interface InstallOperationArgs<TRef extends ExtensionRef> {
  readonly ref: TRef;
  readonly versionConstraint: Option.Option<string>;
  /** When true, skip writing to settings (e.g. pack dependency installs). */
  readonly skipSettings?: boolean;
}

/**
 * Execute the canonical install sequence: materialize -> lockfile -> settings.
 */
const runInstallOperation = <TRef extends ExtensionRef>(
  manager: ExtensionManager<TRef>,
  args: InstallOperationArgs<TRef>,
): Effect.Effect<JobStepResult, AppError, never> =>
  Effect.gen(function* () {
    yield* manager.materializeInstall({ ref: args.ref });
    yield* manager.upsertLockfileEntry({ ref: args.ref });
    if (!args.skipSettings) {
      yield* manager.upsertSettingsEntry({
        ref: args.ref,
        versionConstraint: args.versionConstraint,
      });
    }
    return {
      result: "success" as const,
      message: "Applied install operation",
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
  const compatPkgs = args.ref.refType === "registry" ? args.ref.compatiblePackages : [];

  return {
    label: toLabelWithCompatibility(target, compatPkgs),
    readiness: "ready",
    run: runInstallOperation(manager, args),
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
 *   2. Mark dependency as retained in lockfile
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
    const isInstalled = yield* manager.isInstalled({ target: args.target });
    if (!isInstalled) {
      return {
        result: "success" as const,
        message: "not installed",
      } satisfies JobStepResult;
    }

    const stillRequiredByPack = yield* retentionPolicy.isRequiredByInstalledPack({
      target: args.target,
    });

    if (stillRequiredByPack) {
      yield* manager.removeSettingsEntry({ target: args.target });
      yield* retentionPolicy.markDependencyRetainedInLockfile({ target: args.target });
      return {
        result: "success" as const,
        message: "Kept on disk because dependency is still required by an installed pack",
      } satisfies JobStepResult;
    }

    yield* manager.materializeUninstall({ target: args.target });
    yield* manager.removeLockfileEntry({ target: args.target });
    yield* manager.removeSettingsEntry({ target: args.target });
    return {
      result: "success" as const,
      message: "Applied uninstall operation",
    } satisfies JobStepResult;
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

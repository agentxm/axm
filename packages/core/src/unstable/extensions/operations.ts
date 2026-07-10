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
    case "files":
      return { type: "files", name: ref.file.name };
    case "rule":
      return { type: "rule", name: ref.rule.name };
    case "hook":
      return { type: "hook", name: ref.hook.name };
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
  readonly markDependencyRetainedInLockfile: (args: {
    readonly target: ExtensionTarget;
  }) => Effect.Effect<void, AppError, never>;
}

// -----------------------------------------------------------------------------
// Install Operation
// -----------------------------------------------------------------------------

export interface InstallOperationArgs<TRef extends ExtensionRef> {
  readonly ref: TRef;
  readonly versionRange: Option.Option<string>;
  /** When true, skip writing to settings (e.g. pack dependency installs). */
  readonly skipSettings?: boolean;
  /** When true, mark the lock entry as retained by an installed pack. */
  readonly retainedByPack?: boolean;
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

export interface NewExtensionOperationArgs<
  TRef extends ExtensionRef,
> extends InstallOperationArgs<TRef> {
  readonly scaffold: Effect.Effect<unknown, AppError, never>;
  readonly markAuthored: Effect.Effect<void, AppError, never>;
  readonly message: string;
  readonly label?: string;
}

/**
 * Execute the canonical install sequence: materialize -> lockfile -> settings.
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
    if (
      Option.isSome(configuredSource) &&
      isWorkspaceSourceLocator(configuredSource.value) &&
      args.ref.refType !== "workspace" &&
      args.allowWorkspaceReplacement !== true
    ) {
      return yield* makeAppError({
        code: "conflict",
        detail: `Cannot install over workspace-sourced ${target.type} "${target.name}"`,
        recover:
          "Demote or remove the workspace source explicitly before installing a different source.",
      });
    }
    const installedBefore =
      args.installedBefore === undefined ? false : yield* args.installedBefore;
    yield* manager.materializeInstall({ ref: args.ref });
    yield* manager.upsertLockfileEntry({
      ref: args.ref,
      ...(args.retainedByPack === undefined ? {} : { retainedByPack: args.retainedByPack }),
    });
    if (!args.skipSettings) {
      yield* manager.upsertSettingsEntry({
        ref: args.ref,
        versionRange: args.versionRange,
      });
    }
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

  return {
    key: toStepKey(target),
    label: toLabelWithCompanions(target, companionPkgs),
    readiness: "ready",
    run: runInstallOperation(manager, args),
  } satisfies PlannedJobStep;
};

/**
 * Build a PlannedJobStep for `new` commands.
 *
 * The scaffold runs first, then a workspace-source settings entry is seeded.
 * The manager resolves that canonical package back into a first-class
 * workspace ref before materializing and writing derived lock state.
 */
export const buildNewExtensionStep = <TRef extends ExtensionRef>(
  manager: ExtensionManager<TRef>,
  args: NewExtensionOperationArgs<TRef>,
): PlannedJobStep => {
  const target = targetFromRef(args.ref);
  const companionPkgs = args.ref.refType === "registry" ? args.ref.packages : [];

  return {
    key: toStepKey(target),
    label: args.label ?? toLabelWithCompanions(target, companionPkgs),
    readiness: "ready",
    run: Effect.gen(function* () {
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
      const result = yield* runInstallOperation(manager, { ...args, ref });
      return {
        ...result,
        result: "success" as const,
        message: args.message,
      } satisfies JobStepResult;
    }),
  } satisfies PlannedJobStep;
};

// -----------------------------------------------------------------------------
// Materialize Operation
// -----------------------------------------------------------------------------

export interface MaterializeOperationArgs<TRef extends ExtensionRef> {
  readonly ref: TRef;
  readonly buildArtifact?: () => Effect.Effect<JobStepArtifact, AppError, never>;
  readonly message?: string;
}

const runMaterializeOperation = <TRef extends ExtensionRef>(
  manager: ExtensionManager<TRef>,
  args: MaterializeOperationArgs<TRef>,
): Effect.Effect<JobStepResult, AppError, never> =>
  Effect.gen(function* () {
    yield* manager.materializeInstall({ ref: args.ref });
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
    label: toLabelWithCompanions(target, companionPkgs),
    readiness: "ready",
    run: runMaterializeOperation(manager, args),
  } satisfies PlannedJobStep;
};

// -----------------------------------------------------------------------------
// Uninstall Operation
// -----------------------------------------------------------------------------

export interface UninstallOperationArgs<TRef extends ExtensionRef> {
  readonly target: ExtensionTargetFor<TRef>;
  readonly sourceDisposition?: "keep" | "delete";
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
    const configuredSource =
      manager.getConfiguredSource === undefined
        ? Option.none<string>()
        : yield* manager.getConfiguredSource({ target: args.target });
    const workspaceSource =
      Option.isSome(configuredSource) && isWorkspaceSourceLocator(configuredSource.value);
    if (workspaceSource && args.sourceDisposition === undefined) {
      return yield* makeAppError({
        code: "conflict",
        detail: `Cannot uninstall workspace-sourced ${args.target.type} "${args.target.name}" without an explicit source disposition`,
        recover:
          "Disable it, or choose whether to keep or delete the authoritative source package.",
      });
    }
    if (!workspaceSource && args.sourceDisposition !== undefined) {
      return yield* makeAppError({
        code: "usage",
        detail: "--keep-source and --delete-source apply only to workspace-sourced extensions",
      });
    }
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

    yield* manager.materializeUninstall({
      target: args.target,
      preserveSource: args.sourceDisposition === "keep",
    });
    yield* manager.removeLockfileEntry({ target: args.target });
    yield* manager.removeSettingsEntry({ target: args.target });
    return {
      result: "success" as const,
      message:
        args.sourceDisposition === "keep"
          ? `Removed ${toLabel(args.target)} from management and kept its source package`
          : `Removed ${toLabel(args.target)}`,
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

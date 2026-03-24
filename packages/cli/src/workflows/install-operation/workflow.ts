/**
 * Shared install operation workflow.
 *
 * Defines ExtensionTarget types, ExtensionManager interface,
 * UninstallRetentionPolicy, and the install operation builder/runner.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import type { AppError } from "../../app-error/index.js";
import type { JobStepResult, PlannedJobStep } from "../../workspace/plan.js";
import type { ExtensionRef } from "../../sources/index.js";

// -----------------------------------------------------------------------------
// Extension Target Types
// -----------------------------------------------------------------------------

export interface SkillExtensionTarget {
  readonly type: "skill";
  readonly name: string;
}

export interface PackExtensionTarget {
  readonly type: "pack";
  readonly name: string;
  readonly profile: string;
}

export interface CommandExtensionTarget {
  readonly type: "command";
  readonly name: string;
}

export interface McpServerExtensionTarget {
  readonly type: "mcp-server";
  readonly name: string;
}

export type ExtensionTarget =
  | SkillExtensionTarget
  | PackExtensionTarget
  | CommandExtensionTarget
  | McpServerExtensionTarget;

/**
 * Maps an ExtensionRef type to its corresponding ExtensionTarget type.
 */
export type ExtensionTargetFor<TRef extends ExtensionRef> = Extract<
  ExtensionTarget,
  { readonly type: TRef["type"] }
>;

// -----------------------------------------------------------------------------
// Target Helpers
// -----------------------------------------------------------------------------

/**
 * Derive an ExtensionTarget from an ExtensionRef.
 *
 * Pack targets include profile; skill/command/mcp-server targets are name-only.
 */
export const targetFromRef = (ref: ExtensionRef): ExtensionTarget => {
  switch (ref.type) {
    case "skill":
      return { type: "skill", name: ref.skill.name };
    case "pack":
      return { type: "pack", name: ref.pack.name, profile: ref.profile };
    case "command":
      return { type: "command", name: ref.command.name };
    case "mcp-server":
      return { type: "mcp-server", name: ref.server.name };
  }
};

/**
 * Produce a display label from an ExtensionTarget.
 *
 * Pack targets render as `profile/name`; others render as `name`.
 */
export const toLabel = (target: ExtensionTarget): string =>
  target.type === "pack" ? `${target.profile}/${target.name}` : target.name;

// -----------------------------------------------------------------------------
// Extension Manager Interface
// -----------------------------------------------------------------------------

/**
 * Per-extension-type lifecycle manager contract.
 *
 * All methods have `R = never` — dependencies are captured during construction.
 */
export interface ExtensionManager<TRef extends ExtensionRef> {
  readonly extensionType: TRef["type"];
  readonly materializeInstall: (args: {
    readonly ref: TRef;
  }) => Effect.Effect<void, AppError, never>;
  readonly materializeUninstall: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<void, AppError, never>;
  readonly upsertSettingsEntry: (args: {
    readonly ref: TRef;
    readonly versionConstraint: Option.Option<string>;
  }) => Effect.Effect<void, AppError, never>;
  readonly removeSettingsEntry: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<void, AppError, never>;
  readonly upsertLockfileEntry: (args: {
    readonly ref: TRef;
  }) => Effect.Effect<void, AppError, never>;
  readonly removeLockfileEntry: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<void, AppError, never>;
}

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
// Install Operation Args
// -----------------------------------------------------------------------------

export interface InstallOperationArgs<TRef extends ExtensionRef> {
  readonly ref: TRef;
  readonly versionConstraint: Option.Option<string>;
  /** When true, skip writing to settings (e.g. pack dependency installs). */
  readonly skipSettings?: boolean;
}

// -----------------------------------------------------------------------------
// Install Operation
// -----------------------------------------------------------------------------

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

  return {
    label: toLabel(target),
    readiness: "ready",
    run: runInstallOperation(manager, args),
  } satisfies PlannedJobStep;
};

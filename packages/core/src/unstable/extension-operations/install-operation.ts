/**
 * Shared install operation workflow.
 *
 * Defines UninstallRetentionPolicy, InstallOperationArgs, and the install
 * operation builder/runner. ExtensionTarget types and ExtensionManager interface
 * are imported from the workspace module.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import type { AppError } from "../app-error/index.js";
import type { JobStepResult, PlannedJobStep } from "../workspace/plan.js";
import type { ExtensionRef } from "../sources/index.js";
import type { ExtensionManager, ExtensionTarget } from "../workspace/service-interface.js";

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

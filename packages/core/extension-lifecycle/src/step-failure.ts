/**
 * How a lifecycle closure serializes a failure into the plan-step vocabulary.
 *
 * The feature owns this: a lifecycle step that failed must report the same
 * category, sentence, and recovery whether the failure came from lifecycle
 * policy, from the materialization machinery underneath it, from workspace
 * state, or from the transaction around it. Nothing is supplied by the
 * application, so a lifecycle use case carries no failure adapter in its
 * requirements.
 *
 * Categories and detail sentences are the serialized contract of machine
 * output; families that already carry their own category and fact sentence
 * keep both rather than being replaced with a generic sentence.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  OPERATION_ERROR_CATEGORIES,
  StepFailure,
  restorationIncompleteToStepFailure,
  workspaceStateReadFailureToStepFailure,
  workspaceTransactionFailureToStepFailure,
  type OperationErrorCategory,
} from "@agentxm/workspace-operations";
import {
  LifecyclePostconditionViolated,
  projectionErrorToStepFailure,
} from "@agentxm/extension-materialization";
import { isProjectionError } from "@agentxm/workspace-projection";
import {
  WorkspaceRestorationIncomplete,
  type WorkspaceTransactionFailure,
} from "@agentxm/workspace-transactions";
import type { WorkspaceStateReadFailure } from "@agentxm/workspace-state";

import { ExtensionLifecycleFailed } from "./errors.js";
import type { LifecycleFailure } from "./step-failure-conversion.js";

/** Every failure a lifecycle closure can settle a plan step with. */
export type LifecycleStepFailure = LifecycleFailure;

const CATEGORIES: ReadonlySet<string> = new Set<string>(OPERATION_ERROR_CATEGORIES);

const isCategory = (value: unknown): value is OperationErrorCategory =>
  typeof value === "string" && CATEGORIES.has(value);

const property = (failure: object, key: string): unknown =>
  key in failure ? Reflect.get(failure, key) : undefined;

const WORKSPACE_STATE_READ_TAGS: ReadonlySet<string> = new Set([
  "SettingsDecodeError",
  "SettingsParseError",
  "SettingsIoError",
  "LockfileIoError",
  "LockfileParseError",
  "LockfileDecodeError",
  "LockfileVersionUnsupported",
  "WorkspaceRootEscape",
]);

const WORKSPACE_TRANSACTION_TAGS: ReadonlySet<string> = new Set([
  "WorkspaceSnapshotError",
  "WorkspaceDirectoryError",
  "TransitionLockError",
  "TransitionLockUnavailable",
  "WorkspaceTransitionCompromised",
]);

const isWorkspaceStateReadFailure = (
  failure: LifecycleStepFailure,
): failure is Extract<WorkspaceStateReadFailure, { readonly _tag: string }> =>
  WORKSPACE_STATE_READ_TAGS.has(failure._tag);

const isWorkspaceTransactionFailure = (
  failure: LifecycleStepFailure,
): failure is WorkspaceTransactionFailure => WORKSPACE_TRANSACTION_TAGS.has(failure._tag);

const postconditionDetail = (failure: LifecyclePostconditionViolated): string => {
  switch (failure.postcondition) {
    case "install-observable":
      return `Installed ${failure.targetType} "${failure.targetName}" did not satisfy its observable contract`;
    case "install-declared":
      return `Installed ${failure.targetType} "${failure.targetName}" has no desired-state declaration`;
    case "new-observable":
      return `New ${failure.targetType} "${failure.targetName}" did not satisfy its observable contract`;
    case "new-declared":
      return `New ${failure.targetType} "${failure.targetName}" has no desired-state declaration`;
    case "materialize-observable":
      return `Reconciled ${failure.targetType} "${failure.targetName}" did not satisfy its observable contract`;
    case "uninstall-remains-declared":
      return `Uninstalled ${failure.targetType} "${failure.targetName}" remains declared`;
    case "uninstall-observed-state":
      return `Uninstalled ${failure.targetType} "${failure.targetName}" has an invalid observed postcondition`;
  }
};

/**
 * A family this conversion does not name still carries its own decision: the
 * producer recorded a category and a fact sentence, so both survive, and the
 * failure itself stays in `cause` for the diagnostic chain.
 */
const carriedFailure = (failure: LifecycleStepFailure): StepFailure => {
  const carriedCategory = property(failure, "category");
  const carriedDetail = property(failure, "detail");
  return new StepFailure({
    category: isCategory(carriedCategory) ? carriedCategory : "internal",
    detail:
      typeof carriedDetail === "string"
        ? carriedDetail
        : `The lifecycle step failed with ${failure._tag}`,
    cause: failure,
  });
};

/**
 * Serialize one lifecycle-closure failure into the plan-step vocabulary.
 *
 * Families this feature or the machinery beneath it constructs are rendered
 * exactly; families the kernel already serializes are delegated to it; and
 * anything else carries its producer's own category and sentence through.
 */
export const lifecycleStepFailure = (failure: LifecycleStepFailure): StepFailure => {
  if (failure instanceof StepFailure) return failure;

  if (failure instanceof ExtensionLifecycleFailed) {
    return new StepFailure({
      category: failure.category,
      detail: failure.detail ?? `The lifecycle step was refused (${failure.category})`,
      ...(failure.recover === undefined && failure.suggestions === undefined
        ? {}
        : {
            suggestions: [
              ...(failure.recover === undefined
                ? []
                : [
                    {
                      description: failure.recover,
                      ...(failure.cmd === undefined ? {} : { cmd: failure.cmd }),
                    },
                  ]),
              ...(failure.suggestions ?? []),
            ],
          }),
      ...(failure.cause === undefined ? {} : { cause: failure.cause }),
    });
  }

  if (failure instanceof LifecyclePostconditionViolated) {
    return new StepFailure({ category: "internal", detail: postconditionDetail(failure) });
  }

  if (failure instanceof WorkspaceRestorationIncomplete) {
    return restorationIncompleteToStepFailure(failure);
  }
  if (isWorkspaceTransactionFailure(failure)) {
    return workspaceTransactionFailureToStepFailure(failure);
  }
  if (isWorkspaceStateReadFailure(failure)) {
    return workspaceStateReadFailureToStepFailure(failure);
  }
  // Shared projection states domain facts and renders nothing, so the
  // capability that unions it renders it; `carriedFailure` would find no
  // category and report a projection refusal as an internal defect.
  if (isProjectionError(failure)) {
    return projectionErrorToStepFailure(failure);
  }

  return carriedFailure(failure);
};

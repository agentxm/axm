import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  UpdateExtensions,
  contextForResolution,
  type UpdateCandidate,
  type UpdateSubjectType,
} from "@agentxm/extension-lifecycle";
import {
  AXM_SKILL_BUNDLED_APPLY_COMMAND,
  ReleaseAgePosture,
  type TargetedUpdatePublicContext,
} from "@agentxm/extension-resolution";
import { toExtensionTypePlural } from "@agentxm/extension-model/unstable/extensions";
import {
  credentialFreeLocatorRecoveryValue,
  operationPresentation,
  recoveryPositional,
  recoverySwitch,
  type OperationResolution,
  type PlanExecution,
} from "@agentxm/workspace-operations";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

import { setCommandSemanticProperties, summarizeCommandOutcome } from "../../cli-runtime/index.js";
import { emitOperationResolution, operationResolutionSummary } from "../../operation-output.js";
import { extensionLifecycleFailedToAppError } from "../../feature-errors.js";
import { makeConfirmationRecovery, makePlanExecution } from "../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { handleWorkspaceUpdate } from "./workspace-update-handler.js";

export interface RootUpdateFlags {
  readonly force: boolean;
  readonly preview: boolean;
}

export interface RootUpdateHandlerArgs extends RootUpdateFlags {
  readonly source: Option.Option<string>;
  readonly recoveryCommand?: ReadonlyArray<string>;
}

const INSPECT_INSTALLED: SuggestedAction = {
  description: "Inspect installed extensions",
  cmd: "axm list",
};

/**
 * What to type next when an update is refused. The refusal itself is the
 * feature's; the command that recovers from it is this adapter's, because
 * only the adapter knows how its own routes are spelled. Exported so the
 * argv each blocker recovers through is asserted beside the table itself.
 */
export const blockerSuggestions = (
  context: TargetedUpdatePublicContext | undefined,
): ReadonlyArray<SuggestedAction> => {
  // An unclassified context carries no blocker to recover from; the switch
  // below answers only the classified ones, so a ninth blocker is a compile
  // error here rather than a silently empty suggestion list.
  if (context === undefined || context.blocker === undefined) return [];
  switch (context.blocker) {
    case "not-desired":
      return [
        {
          description: "Install the extension to create direct workspace intent",
          cmd: `axm install ${context.target.fqn}`,
        },
      ];
    case "disabled":
      return [
        {
          description: "Enable the desired extension before updating it",
          cmd: `axm ${toExtensionTypePlural(context.target.type)} enable ${context.target.name}`,
        },
      ];
    case "pack-owned-constraint":
      return [
        {
          description: "Rerun without a version range to preserve pack ownership",
          cmd: `axm update ${context.target.fqn}`,
        },
      ];
    case "incomplete-graph":
      return [{ description: "Preview workspace reconciliation", cmd: "axm sync --preview" }];
    case "constraint-conflict":
      return context.packs.map((pack) =>
        pack.source === "workspace"
          ? {
              description: `Replace ${pack.fqn}'s authored member constraint`,
              cmd: `axm packs add ${pack.fqn} ${context.target.fqn}`,
            }
          : {
              description: `Update ${pack.fqn} if its owner published a compatible constraint`,
              cmd: `axm update ${pack.fqn}`,
            },
      );
    case "bundled-source":
      return [
        {
          description: "Reinstall the compatible skill embedded in this AXM executable",
          cmd: AXM_SKILL_BUNDLED_APPLY_COMMAND,
        },
      ];
    case "source-authority":
      return [
        {
          description: "Update the workspace-authored source, then reconcile it",
          cmd: `axm sync ${context.target.fqn} --preview`,
        },
      ];
    case "stale-plan":
      return [
        {
          description: "Rerun the command to classify a fresh ownership context",
          cmd: `axm update ${context.target.fqn}`,
        },
      ];
  }
};

/** A release the minimum-release-age policy is still holding back. */
const releaseAgeSuggestions = (resolution: OperationResolution): ReadonlyArray<SuggestedAction> => {
  const held = resolution.releaseAge?.holdbacks?.[0];
  if (held === undefined || resolution.blocking?.reference !== "release-age-held") return [];
  return [
    {
      description: `Wait until ${held.eligibleAt}, request an eligible older version, declare ${held.target} in minimumReleaseAgeExclude, or rerun this command with --ignore-release-age.`,
    },
  ];
};

/** Fold the adapter's recovery commands into a refused outcome. */
const withRecovery = (
  resolution: OperationResolution,
  context: TargetedUpdatePublicContext | undefined,
): OperationResolution => {
  const suggestions = [...blockerSuggestions(context), ...releaseAgeSuggestions(resolution)];
  const escape = suggestions[0];
  if (resolution.blocking === undefined || escape === undefined) return resolution;
  return {
    ...resolution,
    blocking: { ...resolution.blocking, escape },
    suggestions,
  };
};

const targetedExecution = (args: RootUpdateHandlerArgs, source: string) =>
  Effect.gen(function* () {
    const posture = yield* ReleaseAgePosture;
    return yield* makePlanExecution(
      { preview: args.preview },
      makeConfirmationRecovery(args.recoveryCommand ?? ["update"], [
        recoverySwitch("--refresh", args.force),
        recoverySwitch("--ignore-release-age", posture === "ignore"),
        recoveryPositional(credentialFreeLocatorRecoveryValue(source)),
      ]),
    );
  });

const reportTargeted = (
  candidate: Exclude<UpdateCandidate, { readonly outcome: "nothing-configured" }>,
  execution: PlanExecution,
  subjectType: UpdateSubjectType,
) =>
  Effect.gen(function* () {
    const resolution = yield* UpdateExtensions.previewOrApply(candidate, execution);
    const context = candidate.targetedContext;
    const reported = withRecovery(resolution, context);
    yield* setCommandSemanticProperties(
      summarizeCommandOutcome(
        operationResolutionSummary(reported, { subjectType, sourceKind: "registry" }),
      ),
    );
    yield* emitOperationResolution("update", reported, {
      suggestions: [INSPECT_INSTALLED],
      ...(context === undefined ? {} : { targetedUpdate: contextForResolution(context, reported) }),
    });
  });

export const handleUpdate = (args: RootUpdateHandlerArgs) =>
  withOperationLifecycle(
    {
      command: "update",
      mode: args.preview ? "preview" : "apply",
      planName: "Update configured extensions",
      presentation: operationPresentation({
        imperative: "update",
        past: "Updated",
        gerund: "Updating",
      }),
    },
    handleUpdateBody(args).pipe(
      Effect.catchTag("ExtensionLifecycleFailed", (failure) =>
        Effect.fail(extensionLifecycleFailedToAppError(failure)),
      ),
    ),
  );

const handleUpdateBody = Effect.fn("Update.handle")(function* (args: RootUpdateHandlerArgs) {
  if (Option.isNone(args.source)) {
    yield* handleWorkspaceUpdate({
      command: "update",
      type: Option.none(),
      planName: "Update configured extensions",
      planDescription: Option.some("Update configured workspace extensions"),
      flags: { force: args.force, preview: args.preview },
    });
    return;
  }

  const source = args.source.value;
  const candidate = yield* UpdateExtensions.prepare({
    kind: "targeted",
    source,
    nonInteractive: false,
  });
  if (candidate.outcome === "nothing-configured") {
    yield* emitNoOpOutcome("update", {
      planName: "Update configured extensions",
      message: candidate.message,
    });
    return;
  }
  const execution = yield* targetedExecution(args, source);
  yield* reportTargeted(candidate, execution, candidate.subjectType);
});

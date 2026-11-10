import {
  renderCommandInvocation,
  recoverySwitch,
  type CommandInvocation,
} from "./command-invocation.js";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import type { PlanPolicyId } from "./plan.js";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";

export interface ConfiguredAgentOperation {
  readonly extensionType: ExtensionType;
  readonly name: string;
  readonly plannedState: "enabled" | "disabled" | "absent";
}

/**
 * How an apply may satisfy a confirmable risk condition.
 *
 * - `preapproved`: the person supplied explicit preapproval for this
 *   invocation on a command that offers a preapprovable confirmation.
 * - `prompt-if-interactive`: the command offers a preapprovable confirmation
 *   and none was given; a prompt opens when one can, and recovery may
 *   suggest preapproval.
 * - `interactive-only`: the command has no preapprovable confirmation. A
 *   confirmable condition it meets is unexpected for unattended use: it
 *   prompts when a prompt can open and otherwise blocks naming interactive
 *   approval, never a preapproval flag the command does not accept.
 */
export type ConfirmableRiskApproval = "preapproved" | "prompt-if-interactive" | "interactive-only";

/**
 * What an invoking surface parsed about the approval a request carries.
 *
 * `preapproved` is present only on the routes whose capabilities declare a
 * preapprovable confirmation; every other route omits it. The absence of the
 * field is therefore a fact about the route, not a missing answer, and it is
 * what separates "the person declined to preapprove" from "this request could
 * never have been preapproved".
 */
interface RequestedApproval {
  readonly preapproved?: boolean;
}

/**
 * The one derivation of an approval mode from what a request carries.
 *
 * It lives with plan execution rather than in a transport adapter because the
 * distinction it draws — between a route that offers preapproval and one that
 * does not — is what `resolveExecutionCandidate` uses to decide whether an
 * unattended apply blocks naming interactive approval or names a flag.
 */
const confirmableRiskApproval = (requested: RequestedApproval): ConfirmableRiskApproval =>
  requested.preapproved === true
    ? "preapproved"
    : requested.preapproved === false
      ? "prompt-if-interactive"
      : "interactive-only";

type PlanExecutionRequest =
  | { readonly mode: "preview" }
  | {
      readonly mode: "apply";
      readonly confirmableRiskApproval: ConfirmableRiskApproval;
      readonly acceptedPolicies: ReadonlySet<PlanPolicyId>;
    };

/** Invocation-scoped policy input plus safe replay metadata for approval recovery. */
export type PlanExecution =
  | { readonly request: { readonly mode: "preview" } }
  | {
      readonly request: Extract<PlanExecutionRequest, { readonly mode: "apply" }>;
      readonly approvalRecovery: CommandInvocation;
    };

export const previewPlanExecution: PlanExecution = { request: { mode: "preview" } };

/**
 * What a command parsed about its own invocation before any plan exists.
 *
 * `yes` is present only on the routes whose capabilities declare a
 * preapprovable confirmation; every other route omits it, exactly as
 * `RequestedApproval` describes.
 */
export interface RequestedPlanIntent {
  readonly preview: boolean;
  readonly yes?: boolean;
}

/**
 * The one derivation of a plan execution from what a request carries.
 *
 * It lives here for the same reason `confirmableRiskApproval` does: the
 * preview arm of `PlanExecution` has no field an approval could occupy, so
 * advance approval accompanying a preview is dropped by this derivation
 * rather than by a transport adapter's own convention. A preview therefore
 * cannot spend an approval it never receives, and two requests that differ
 * only in approval reach `resolveExecutionCandidate` as the same execution.
 */
export const requestedPlanExecution = (options: {
  readonly intent: RequestedPlanIntent;
  readonly recovery: CommandInvocation;
  readonly acceptedPolicies?: ReadonlySet<PlanPolicyId>;
}): PlanExecution =>
  options.intent.preview
    ? previewPlanExecution
    : applyPlanExecution({
        approval: confirmableRiskApproval(
          options.intent.yes === undefined ? {} : { preapproved: options.intent.yes },
        ),
        ...(options.acceptedPolicies === undefined
          ? {}
          : { acceptedPolicies: options.acceptedPolicies }),
        recovery: options.recovery,
      });

export const applyPlanExecution = (options: {
  readonly approval: ConfirmableRiskApproval;
  readonly acceptedPolicies?: ReadonlySet<PlanPolicyId>;
  readonly recovery: CommandInvocation;
}): PlanExecution => ({
  request: {
    mode: "apply",
    confirmableRiskApproval: options.approval,
    acceptedPolicies: options.acceptedPolicies ?? new Set(),
  },
  approvalRecovery: options.recovery,
});

/**
 * How a rendered recovery command obtains approval.
 *
 * - `preapprovable`: the route accepts preapproval, so the replay appends it.
 * - `interactive`: approval can only be given at a prompt, so the replay drops
 *   the switches that prohibit one and appends nothing.
 * - `none`: the replay carries neither; used when a named policy override is
 *   the missing input.
 */
export type RecoveryApproval = "preapprovable" | "interactive" | "none";

const PREAPPROVAL_FLAG = "--yes";
const PROMPT_PROHIBITING_FLAGS = new Set(["--json", "--non-interactive"]);
const NON_REPLAYED_FLAGS = new Set(["--preview", PREAPPROVAL_FLAG]);

const confirmationRecoveryInvocation = (
  recovery: CommandInvocation,
  options: {
    readonly approval: RecoveryApproval;
    readonly additionalSwitches?: ReadonlyArray<string>;
  },
): CommandInvocation => ({
  ...recovery,
  arguments: [
    ...recovery.arguments.filter(
      (argument) =>
        argument._tag === "Positional" ||
        !(
          NON_REPLAYED_FLAGS.has(argument.flag) ||
          (options.approval === "interactive" && PROMPT_PROHIBITING_FLAGS.has(argument.flag))
        ),
    ),
    ...(options.approval === "preapprovable" ? [recoverySwitch(PREAPPROVAL_FLAG, true)] : []),
    ...(options.additionalSwitches ?? []).map((flag) => recoverySwitch(flag, true)),
  ],
});

export const renderConfirmationRecoveryCommand = (
  recovery: CommandInvocation,
  options: {
    readonly approval: RecoveryApproval;
    readonly additionalSwitches?: ReadonlyArray<string>;
  },
): string | undefined => renderCommandInvocation(confirmationRecoveryInvocation(recovery, options));

export const namedPolicyRecoverySuggestions = (
  recovery: CommandInvocation,
  requiredFlags: ReadonlyArray<string>,
): ReadonlyArray<SuggestedAction> => {
  const command = renderConfirmationRecoveryCommand(recovery, {
    approval: "none",
    additionalSwitches: requiredFlags,
  });
  return command === undefined
    ? [
        {
          description: `Rerun the original invocation with ${requiredFlags.join(" ")}; a retry command is unavailable because it contains protected or unclassified values.`,
        },
      ]
    : [{ description: "Retry with the required policy override", cmd: command }];
};

const INTERACTIVE_APPROVAL_DESCRIPTION =
  "Approve interactively: rerun in a terminal without --json or --non-interactive and confirm the plan";

/**
 * The recovery a blocked confirmation offers. A preapprovable confirmation
 * replays the invocation with explicit preapproval; an interactive-only one
 * names the need for a prompt and the mode changes that let one open.
 */
export const confirmationRecoverySuggestions = (
  recovery: CommandInvocation,
  approval: Exclude<RecoveryApproval, "none">,
): ReadonlyArray<SuggestedAction> => {
  const command = renderConfirmationRecoveryCommand(recovery, { approval });
  if (approval === "interactive") {
    return command === undefined
      ? [{ description: INTERACTIVE_APPROVAL_DESCRIPTION }]
      : [{ description: INTERACTIVE_APPROVAL_DESCRIPTION, cmd: command }];
  }
  return command === undefined
    ? [
        {
          description:
            "Rerun the original invocation with --yes; a retry command is unavailable because it contains protected or unclassified values.",
        },
      ]
    : [{ description: "Retry with explicit confirmation", cmd: command }];
};

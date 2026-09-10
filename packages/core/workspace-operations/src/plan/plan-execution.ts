import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import type { PlanPolicyId } from "./plan.js";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";

export interface ConfiguredAgentOperation {
  readonly extensionType: ExtensionType;
  readonly name: string;
  readonly plannedState: "enabled" | "disabled" | "absent";
}

export type ConfirmationRecoveryValue =
  | { readonly _tag: "Public"; readonly value: string }
  | { readonly _tag: "Protected" }
  | { readonly _tag: "Unclassified" };

export type ConfirmationRecoveryArgument =
  | { readonly _tag: "Option"; readonly flag: string; readonly value: ConfirmationRecoveryValue }
  | { readonly _tag: "Positional"; readonly value: ConfirmationRecoveryValue }
  | { readonly _tag: "Switch"; readonly flag: string; readonly enabled: boolean };

export interface ConfirmationRecovery {
  readonly command: ReadonlyArray<string>;
  readonly arguments: ReadonlyArray<ConfirmationRecoveryArgument>;
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

export type PlanExecutionRequest =
  | { readonly mode: "preview" }
  | {
      readonly mode: "apply";
      readonly confirmableRiskApproval: ConfirmableRiskApproval;
      readonly acceptedPolicies: ReadonlySet<PlanPolicyId>;
    };

/** Invocation-scoped policy input plus safe replay metadata for approval recovery. */
export type PlanExecution =
  | {
      readonly request: { readonly mode: "preview" };
      readonly configuredAgentOperations?: ReadonlyArray<ConfiguredAgentOperation>;
    }
  | {
      readonly request: Extract<PlanExecutionRequest, { readonly mode: "apply" }>;
      readonly approvalRecovery: ConfirmationRecovery;
      readonly configuredAgentOperations?: ReadonlyArray<ConfiguredAgentOperation>;
    };

export const previewPlanExecution: PlanExecution = { request: { mode: "preview" } };

export const applyPlanExecution = (options: {
  readonly approval: ConfirmableRiskApproval;
  readonly acceptedPolicies?: ReadonlySet<PlanPolicyId>;
  readonly recovery: ConfirmationRecovery;
  readonly configuredAgentOperations?: ReadonlyArray<ConfiguredAgentOperation>;
}): PlanExecution => ({
  request: {
    mode: "apply",
    confirmableRiskApproval: options.approval,
    acceptedPolicies: options.acceptedPolicies ?? new Set(),
  },
  approvalRecovery: options.recovery,
  ...(options.configuredAgentOperations === undefined
    ? {}
    : { configuredAgentOperations: options.configuredAgentOperations }),
});

export const publicRecoveryValue = (value: string): ConfirmationRecoveryValue => ({
  _tag: "Public",
  value,
});

export const protectedRecoveryValue = (): ConfirmationRecoveryValue => ({ _tag: "Protected" });

export const unclassifiedRecoveryValue = (): ConfirmationRecoveryValue => ({
  _tag: "Unclassified",
});

export const credentialFreeLocatorRecoveryValue = (value: string): ConfirmationRecoveryValue => {
  try {
    const parsed = new URL(value);
    const hasSensitiveQuery = [...parsed.searchParams.keys()].some((key) =>
      /(?:auth|key|password|secret|signature|token)/i.test(key),
    );
    return parsed.username.length === 0 && parsed.password.length === 0 && !hasSensitiveQuery
      ? publicRecoveryValue(value)
      : protectedRecoveryValue();
  } catch {
    return publicRecoveryValue(value);
  }
};

export const recoveryOption = (
  flag: string,
  value: ConfirmationRecoveryValue,
): ConfirmationRecoveryArgument => ({ _tag: "Option", flag, value });

export const recoveryPositional = (
  value: ConfirmationRecoveryValue,
): ConfirmationRecoveryArgument => ({ _tag: "Positional", value });

export const recoverySwitch = (flag: string, enabled: boolean): ConfirmationRecoveryArgument => ({
  _tag: "Switch",
  flag,
  enabled,
});

const safeShellToken = /^[A-Za-z0-9_@%+=:,./^-]+$/;

const quoteShellToken = (value: string): string =>
  value.length > 0 && safeShellToken.test(value) ? value : `'${value.replaceAll("'", `'"'"'`)}'`;

const isReplayable = (argument: ConfirmationRecoveryArgument): boolean =>
  argument._tag === "Switch" ||
  (argument.value._tag === "Public" && !/[()]/.test(argument.value.value));

const renderValue = (value: ConfirmationRecoveryValue): string | undefined =>
  value._tag === "Public" && !/[()]/.test(value.value) ? quoteShellToken(value.value) : undefined;

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

export const renderConfirmationRecoveryCommand = (
  recovery: ConfirmationRecovery,
  options: {
    readonly approval: RecoveryApproval;
    readonly additionalSwitches?: ReadonlyArray<string>;
  },
): string | undefined => {
  if (recovery.command.length === 0 || !recovery.arguments.every(isReplayable)) return undefined;
  const dropped = (flag: string): boolean =>
    NON_REPLAYED_FLAGS.has(flag) ||
    (options.approval === "interactive" && PROMPT_PROHIBITING_FLAGS.has(flag));

  const optionTokens = recovery.arguments.flatMap((argument): ReadonlyArray<string> => {
    switch (argument._tag) {
      case "Switch":
        return argument.enabled && !dropped(argument.flag) ? [argument.flag] : [];
      case "Option": {
        if (dropped(argument.flag)) return [];
        const value = renderValue(argument.value);
        return value === undefined ? [] : [argument.flag, value];
      }
      case "Positional":
        return [];
    }
  });
  const positionalValues = recovery.arguments.flatMap((argument): ReadonlyArray<string> => {
    if (argument._tag !== "Positional") return [];
    const value = renderValue(argument.value);
    return value === undefined ? [] : [value];
  });
  const needsOptionTerminator = recovery.arguments.some(
    (argument) =>
      argument._tag === "Positional" &&
      argument.value._tag === "Public" &&
      argument.value.value.startsWith("-"),
  );
  const tokens = [
    "axm",
    ...recovery.command,
    ...optionTokens,
    ...(options.approval === "preapprovable" ? [PREAPPROVAL_FLAG] : []),
    ...(options.additionalSwitches ?? []),
    ...(needsOptionTerminator ? ["--"] : []),
    ...positionalValues,
  ];
  return tokens.join(" ");
};

export const namedPolicyRecoverySuggestions = (
  recovery: ConfirmationRecovery,
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
  recovery: ConfirmationRecovery,
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

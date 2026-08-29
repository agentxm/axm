import type { SuggestedAction } from "./suggested-action.js";
import type { PlanPolicyId } from "../plan/plan.js";
import type { ExtensionType } from "../extensions/common.js";

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

export type PlanExecutionRequest =
  | { readonly mode: "preview" }
  | {
      readonly mode: "apply";
      readonly confirmableRiskApproval: "prompt-if-interactive" | "preapproved";
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
  readonly approval: "prompt-if-interactive" | "preapproved";
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

const emptyRecovery: ConfirmationRecovery = { command: [], arguments: [] };

export const preapprovedPlanExecution: PlanExecution = applyPlanExecution({
  approval: "preapproved",
  recovery: emptyRecovery,
});

export const promptablePlanExecution = (
  recovery: ConfirmationRecovery,
  acceptedPolicies?: ReadonlySet<PlanPolicyId>,
): PlanExecution =>
  applyPlanExecution({
    approval: "prompt-if-interactive",
    ...(acceptedPolicies === undefined ? {} : { acceptedPolicies }),
    recovery,
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

export const renderConfirmationRecoveryCommand = (
  recovery: ConfirmationRecovery,
  options: {
    readonly includeYes?: boolean;
    readonly additionalSwitches?: ReadonlyArray<string>;
  } = {},
): string | undefined => {
  if (recovery.command.length === 0 || !recovery.arguments.every(isReplayable)) return undefined;

  const optionTokens = recovery.arguments.flatMap((argument): ReadonlyArray<string> => {
    switch (argument._tag) {
      case "Switch":
        return argument.enabled && argument.flag !== "--preview" && argument.flag !== "--yes"
          ? [argument.flag]
          : [];
      case "Option": {
        if (argument.flag === "--preview" || argument.flag === "--yes") return [];
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
    ...(options.includeYes === false ? [] : ["--yes"]),
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
    includeYes: false,
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

export const confirmationRecoverySuggestions = (
  recovery: ConfirmationRecovery,
): ReadonlyArray<SuggestedAction> => {
  const command = renderConfirmationRecoveryCommand(recovery);
  return command === undefined
    ? [
        {
          description:
            "Rerun the original invocation with --yes; a retry command is unavailable because it contains protected or unclassified values.",
        },
      ]
    : [{ description: "Retry with explicit confirmation", cmd: command }];
};

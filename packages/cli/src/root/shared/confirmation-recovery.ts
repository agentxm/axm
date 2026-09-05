import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  debugFlag,
  jsonFlag,
  nonInteractiveFlag,
  quietFlag,
  verboseFlag,
} from "../../cli-flags/index.js";
import {
  applyPlanExecution,
  credentialFreeLocatorRecoveryValue,
  previewPlanExecution,
  publicRecoveryValue,
  recoveryPositional,
  recoverySwitch,
  type ConfirmableRiskApproval,
  type ConfirmationRecovery,
  type ConfirmationRecoveryArgument,
  type ConfiguredAgentOperation,
  type PlanExecution,
} from "@agentxm/workspace-operations";
import type { PlanPolicyId } from "@agentxm/workspace-operations";
import {
  isExtensionTypePlural,
  parseExtensionSpecParts,
  toExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import { WorkspaceMutations } from "@agentxm/workspace-state";

/**
 * The parsed intent a command converts into a plan execution.
 *
 * `yes` is present only on the routes whose capabilities declare a
 * preapprovable confirmation and therefore register `--yes`. Every other
 * route omits it, so the conversion below cannot manufacture preapproval a
 * command never offered, and a downstream planner never sees the raw flag.
 */
export interface CommandExecutionIntent {
  readonly preview: boolean;
  readonly yes?: boolean;
}

export const makeConfirmationRecovery = (
  command: ReadonlyArray<string>,
  arguments_: ReadonlyArray<ConfirmationRecoveryArgument>,
): ConfirmationRecovery => ({ command, arguments: arguments_ });

const explicitGlobalArguments = Effect.gen(function* () {
  const json = Option.exists(Option.flatten(yield* Effect.serviceOption(jsonFlag)), Boolean);
  const nonInteractive = Option.exists(
    Option.flatten(yield* Effect.serviceOption(nonInteractiveFlag)),
    Boolean,
  );
  const quiet = Option.getOrElse(yield* Effect.serviceOption(quietFlag), () => false);
  const verbose = Option.getOrElse(yield* Effect.serviceOption(verboseFlag), () => false);
  const debug = Option.getOrElse(yield* Effect.serviceOption(debugFlag), () => false);
  const workspace = yield* Effect.serviceOption(WorkspaceMutations);
  const userScope = Option.exists(workspace, (service) => service.scope === "user");
  return [
    ...(userScope
      ? [
          {
            _tag: "Option",
            flag: "--scope",
            value: { _tag: "Public", value: "user" },
          } satisfies ConfirmationRecoveryArgument,
        ]
      : []),
    recoverySwitch("--json", json),
    recoverySwitch("--non-interactive", nonInteractive),
    recoverySwitch("--quiet", quiet),
    recoverySwitch("--verbose", verbose && !debug),
    recoverySwitch("--debug", debug),
  ];
});

/** The one conversion from a command's parsed intent to a kernel approval decision. */
export const confirmableRiskApproval = (intent: CommandExecutionIntent): ConfirmableRiskApproval =>
  intent.yes === true
    ? "preapproved"
    : intent.yes === false
      ? "prompt-if-interactive"
      : "interactive-only";

export const makePlanExecution = (
  intent: CommandExecutionIntent,
  recovery: ConfirmationRecovery,
  acceptedPolicies: ReadonlyArray<PlanPolicyId> = [],
  configuredAgentOperations?: ReadonlyArray<ConfiguredAgentOperation>,
): Effect.Effect<PlanExecution> => {
  if (intent.preview)
    return Effect.succeed({
      ...previewPlanExecution,
      ...(configuredAgentOperations === undefined ? {} : { configuredAgentOperations }),
    });
  return Effect.map(explicitGlobalArguments, (globalArguments) =>
    applyPlanExecution({
      approval: confirmableRiskApproval(intent),
      acceptedPolicies: new Set(acceptedPolicies),
      recovery: {
        ...recovery,
        arguments: [...recovery.arguments, ...globalArguments],
      },
      ...(configuredAgentOperations === undefined ? {} : { configuredAgentOperations }),
    }),
  );
};

const configuredAgentOperation = (
  command: ReadonlyArray<string>,
  name: string | undefined,
): ConfiguredAgentOperation | undefined => {
  const [group, verb] = command;
  if (
    name === undefined ||
    !isExtensionTypePlural(group) ||
    (verb !== "install" &&
      verb !== "update" &&
      verb !== "enable" &&
      verb !== "disable" &&
      verb !== "uninstall")
  ) {
    return undefined;
  }
  return {
    extensionType: toExtensionType(group),
    name,
    plannedState: verb === "uninstall" ? "absent" : verb === "disable" ? "disabled" : "enabled",
  };
};

export const makePublicPositionalPlanExecution = (
  intent: CommandExecutionIntent,
  command: ReadonlyArray<string>,
  positionals: ReadonlyArray<string>,
  acceptedPolicies: ReadonlyArray<PlanPolicyId> = [],
): Effect.Effect<PlanExecution> =>
  makePlanExecution(
    intent,
    makeConfirmationRecovery(
      command,
      positionals.map((value) => recoveryPositional(publicRecoveryValue(value))),
    ),
    acceptedPolicies,
    [configuredAgentOperation(command, positionals[0])].filter(
      (operation): operation is ConfiguredAgentOperation => operation !== undefined,
    ),
  );

export const makeInstallPlanExecution = (
  intent: CommandExecutionIntent & { readonly force?: boolean },
  command: ReadonlyArray<string>,
  locators: ReadonlyArray<string>,
  arguments_: ReadonlyArray<ConfirmationRecoveryArgument> = [],
): Effect.Effect<PlanExecution> =>
  makePlanExecution(
    intent,
    makeConfirmationRecovery(command, [
      recoverySwitch("--reinstall", intent.force === true),
      ...arguments_,
      ...locators.map((value) => recoveryPositional(credentialFreeLocatorRecoveryValue(value))),
    ]),
  );

export const makeUninstallPlanExecution = (
  intent: CommandExecutionIntent,
  command: ReadonlyArray<string>,
  positionals: ReadonlyArray<string>,
): Effect.Effect<PlanExecution> =>
  makePlanExecution(
    intent,
    makeConfirmationRecovery(command, [
      ...positionals.map((value) => recoveryPositional(publicRecoveryValue(value))),
    ]),
    [],
    (() => {
      const rootParts =
        command[0] === "uninstall" ? parseExtensionSpecParts(positionals[0] ?? "") : undefined;
      return [
        configuredAgentOperation(command, positionals[0]),
        rootParts === undefined
          ? undefined
          : {
              extensionType: rootParts.type,
              name: rootParts.name,
              plannedState: "absent",
            },
      ].filter((operation): operation is ConfiguredAgentOperation => operation !== undefined);
    })(),
  );

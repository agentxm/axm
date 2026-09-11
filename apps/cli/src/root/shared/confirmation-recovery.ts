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
  credentialFreeLocatorRecoveryValue,
  publicRecoveryValue,
  recoveryPositional,
  recoverySwitch,
  requestedPlanExecution,
  type ConfirmationRecovery,
  type ConfirmationRecoveryArgument,
  type ConfiguredAgentOperation,
  type PlanExecution,
  type RequestedPlanIntent,
} from "@agentxm/workspace-operations";
import type { PlanPolicyId } from "@agentxm/workspace-operations";
import {
  isExtensionTypePlural,
  parseExtensionSpecParts,
  toExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import { WorkspaceLocation } from "@agentxm/workspace-state";

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
  const location = yield* Effect.serviceOption(WorkspaceLocation);
  const userScope = Option.exists(location, ({ scope }) => scope === "user");
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

/**
 * The parsed intent a route registered, handed to the one derivation that
 * owns it. `yes` reaches this function only from the routes whose
 * capabilities declare a preapprovable confirmation and therefore register
 * `--yes`; the derivation in `workspace-operations` decides what a preview
 * and an apply each do with it, so no downstream planner sees the raw flag.
 */
export const makePlanExecution = (
  intent: RequestedPlanIntent,
  recovery: ConfirmationRecovery,
  acceptedPolicies: ReadonlyArray<PlanPolicyId> = [],
  configuredAgentOperations?: ReadonlyArray<ConfiguredAgentOperation>,
): Effect.Effect<PlanExecution> =>
  Effect.map(explicitGlobalArguments, (globalArguments) =>
    requestedPlanExecution({
      intent,
      recovery: {
        ...recovery,
        arguments: [...recovery.arguments, ...globalArguments],
      },
      acceptedPolicies: new Set(acceptedPolicies),
      ...(configuredAgentOperations === undefined ? {} : { configuredAgentOperations }),
    }),
  );

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
  intent: RequestedPlanIntent,
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
  intent: RequestedPlanIntent & { readonly force?: boolean },
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
  intent: RequestedPlanIntent,
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

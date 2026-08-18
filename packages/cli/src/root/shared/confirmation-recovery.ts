import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  debugFlag,
  jsonFlag,
  nonInteractiveFlag,
  quietFlag,
  verboseFlag,
} from "@agentxm/client-core/unstable/cli-flags";
import {
  applyPlanExecution,
  credentialFreeLocatorRecoveryValue,
  previewPlanExecution,
  publicRecoveryValue,
  recoveryPositional,
  recoverySwitch,
  type ConfirmationRecovery,
  type ConfirmationRecoveryArgument,
  type ConfiguredAgentOperation,
  type PlanExecution,
} from "@agentxm/client-core/unstable/cli-runtime";
import type { PlanPolicyId } from "@agentxm/client-core/unstable/plan";
import {
  isExtensionTypePlural,
  parseExtensionSpecParts,
  toExtensionType,
} from "@agentxm/client-core/unstable/extensions";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";

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

export const makePlanExecution = (
  flags: { readonly yes: boolean; readonly preview: boolean },
  recovery: ConfirmationRecovery,
  acceptedPolicies: ReadonlyArray<PlanPolicyId> = [],
  configuredAgentOperations?: ReadonlyArray<ConfiguredAgentOperation>,
): Effect.Effect<PlanExecution> => {
  if (flags.preview)
    return Effect.succeed({
      ...previewPlanExecution,
      ...(configuredAgentOperations === undefined ? {} : { configuredAgentOperations }),
    });
  return Effect.map(explicitGlobalArguments, (globalArguments) =>
    applyPlanExecution({
      approval: flags.yes ? "preapproved" : "prompt-if-interactive",
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
    targetEnabled: verb !== "disable" && verb !== "uninstall",
  };
};

export const makePublicPositionalPlanExecution = (
  flags: { readonly yes: boolean; readonly preview: boolean },
  command: ReadonlyArray<string>,
  positionals: ReadonlyArray<string>,
  acceptedPolicies: ReadonlyArray<PlanPolicyId> = [],
): Effect.Effect<PlanExecution> =>
  makePlanExecution(
    flags,
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
  flags: { readonly yes: boolean; readonly preview: boolean; readonly force?: boolean },
  command: ReadonlyArray<string>,
  locators: ReadonlyArray<string>,
  arguments_: ReadonlyArray<ConfirmationRecoveryArgument> = [],
): Effect.Effect<PlanExecution> =>
  makePlanExecution(
    flags,
    makeConfirmationRecovery(command, [
      recoverySwitch("--reinstall", flags.force === true),
      ...arguments_,
      ...locators.map((value) => recoveryPositional(credentialFreeLocatorRecoveryValue(value))),
    ]),
  );

export const makeUninstallPlanExecution = (
  flags: { readonly yes: boolean; readonly preview: boolean },
  command: ReadonlyArray<string>,
  positionals: ReadonlyArray<string>,
): Effect.Effect<PlanExecution> =>
  makePlanExecution(
    flags,
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
              targetEnabled: false,
            },
      ].filter((operation): operation is ConfiguredAgentOperation => operation !== undefined);
    })(),
  );

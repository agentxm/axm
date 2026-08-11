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
  confirmableApplyExecution,
  credentialFreeLocatorRecoveryValue,
  preconfirmedApplyExecution,
  previewExecution,
  publicRecoveryValue,
  recoveryPositional,
  recoverySwitch,
  type ConfirmationRecovery,
  type ConfirmationRecoveryArgument,
  type PlanExecutionMode,
} from "@agentxm/client-core/unstable/cli-runtime";
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

export const makePlanExecutionMode = (
  flags: { readonly yes: boolean; readonly preview: boolean },
  recovery: ConfirmationRecovery,
): Effect.Effect<PlanExecutionMode> => {
  if (flags.preview) return Effect.succeed(previewExecution);
  if (flags.yes) return Effect.succeed(preconfirmedApplyExecution);
  return Effect.map(explicitGlobalArguments, (globalArguments) =>
    confirmableApplyExecution({
      ...recovery,
      arguments: [...recovery.arguments, ...globalArguments],
    }),
  );
};

export const makePublicPositionalPlanExecutionMode = (
  flags: { readonly yes: boolean; readonly preview: boolean },
  command: ReadonlyArray<string>,
  positionals: ReadonlyArray<string>,
): Effect.Effect<PlanExecutionMode> =>
  makePlanExecutionMode(
    flags,
    makeConfirmationRecovery(
      command,
      positionals.map((value) => recoveryPositional(publicRecoveryValue(value))),
    ),
  );

export const makeInstallPlanExecutionMode = (
  flags: { readonly yes: boolean; readonly preview: boolean; readonly force?: boolean },
  command: ReadonlyArray<string>,
  locators: ReadonlyArray<string>,
  arguments_: ReadonlyArray<ConfirmationRecoveryArgument> = [],
): Effect.Effect<PlanExecutionMode> =>
  makePlanExecutionMode(
    flags,
    makeConfirmationRecovery(command, [
      recoverySwitch("--reinstall", flags.force === true),
      ...arguments_,
      ...locators.map((value) => recoveryPositional(credentialFreeLocatorRecoveryValue(value))),
    ]),
  );

export const makeUninstallPlanExecutionMode = (
  flags: { readonly yes: boolean; readonly preview: boolean; readonly force?: boolean },
  command: ReadonlyArray<string>,
  positionals: ReadonlyArray<string>,
): Effect.Effect<PlanExecutionMode> =>
  makePlanExecutionMode(
    flags,
    makeConfirmationRecovery(command, [
      recoverySwitch("--break-dependencies", flags.force === true),
      ...positionals.map((value) => recoveryPositional(publicRecoveryValue(value))),
    ]),
  );

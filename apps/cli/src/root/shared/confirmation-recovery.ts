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
  recoveryOption,
  recoveryPositional,
  recoverySwitch,
  renderConfirmationRecoveryCommand,
  requestedPlanExecution,
  type ConfirmationRecovery,
  type ConfirmationRecoveryArgument,
  type PlanExecution,
  type RequestedPlanIntent,
  type ResolvedUnit,
} from "@agentxm/workspace/transitions/planning";
import type { PlanPolicyId } from "@agentxm/workspace/transitions/planning";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import { WorkspaceLocation } from "@agentxm/workspace/desired-state";
import { extensionFromStepKey } from "@agentxm/workspace/reconciliation";

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
 * What one invocation hands the kernel, and what it keeps to name itself.
 *
 * The execution carries the parsed intent; the recovery is the invocation as
 * every recovery line replays it — the route's own arguments followed by the
 * explicit global flags — and is the one value the kernel's command renderer
 * reads, whether the line asks for approval, a policy override, or a retry.
 */
export interface PlanInvocation {
  readonly execution: PlanExecution;
  readonly recovery: ConfirmationRecovery;
}

/**
 * The parsed intent a route registered, handed to the one derivation that
 * owns it. `yes` reaches this function only from the routes whose
 * capabilities declare a preapprovable confirmation and therefore register
 * `--yes`; the derivation in `workspace-operations` decides what a preview
 * and an apply each do with it, so no downstream planner sees the raw flag.
 */
export const makePlanInvocation = (
  intent: RequestedPlanIntent,
  recovery: ConfirmationRecovery,
  acceptedPolicies: ReadonlyArray<PlanPolicyId> = [],
): Effect.Effect<PlanInvocation> =>
  Effect.map(explicitGlobalArguments, (globalArguments): PlanInvocation => {
    const replayed = { ...recovery, arguments: [...recovery.arguments, ...globalArguments] };
    return {
      execution: requestedPlanExecution({
        intent,
        recovery: replayed,
        acceptedPolicies: new Set(acceptedPolicies),
      }),
      recovery: replayed,
    };
  });

export const makePublicPositionalPlanInvocation = (
  intent: RequestedPlanIntent,
  command: ReadonlyArray<string>,
  positionals: ReadonlyArray<string>,
  acceptedPolicies: ReadonlyArray<PlanPolicyId> = [],
): Effect.Effect<PlanInvocation> =>
  makePlanInvocation(
    intent,
    makeConfirmationRecovery(
      command,
      positionals.map((value) => recoveryPositional(publicRecoveryValue(value))),
    ),
    acceptedPolicies,
  );

export const makeInstallPlanInvocation = (
  intent: RequestedPlanIntent & { readonly force?: boolean },
  command: ReadonlyArray<string>,
  locators: ReadonlyArray<string>,
  arguments_: ReadonlyArray<ConfirmationRecoveryArgument> = [],
): Effect.Effect<PlanInvocation> =>
  makePlanInvocation(
    intent,
    makeConfirmationRecovery(command, [
      recoverySwitch("--reinstall", intent.force === true),
      ...arguments_,
      ...locators.map((value) => recoveryPositional(credentialFreeLocatorRecoveryValue(value))),
    ]),
  );

/**
 * The retry a route offers for the units that did not settle: the invocation
 * replayed as the kernel renders it. A recovery whose values cannot be echoed
 * safely is described without a command, exactly as an approval recovery is.
 */
export const retrySuggestion = (
  description: string,
  recovery: ConfirmationRecovery,
): SuggestedAction => {
  const cmd = renderConfirmationRecoveryCommand(recovery, { approval: "none" });
  return cmd === undefined ? { description } : { description, cmd };
};

/** The extension a ledger unit is about, read from its planned step key. */
const typedUnit = (unit: ResolvedUnit<unknown>) => extensionFromStepKey(unit.id);

const INSTALL_SELECTION_FLAGS = new Set([
  "--all",
  "--skill",
  "--mcp",
  "--subagent",
  "--rule",
  "--hook",
  "--knowledge",
  "--pack",
]);

const isInstallSelection = (argument: ConfirmationRecoveryArgument): boolean =>
  argument._tag !== "Positional" &&
  INSTALL_SELECTION_FLAGS.has(argument.flag) &&
  (argument._tag === "Option" || argument.enabled);

const installSelectorFlag = (type: ExtensionType): string =>
  `--${type === "mcp-server" ? "mcp" : type}`;

/**
 * An install replayed for the units that did not settle. An invocation that
 * selected extensions from its source — by `--all` or by name — selects only
 * the waiting ones on the retry; one that selected nothing, or whose waiting
 * units are not extensions the selectors can name, is replayed as typed, and
 * the units it already settled converge as no-ops.
 */
export const narrowInstallSelection = (
  recovery: ConfirmationRecovery,
  unsettled: ReadonlyArray<ResolvedUnit<unknown>>,
): ConfirmationRecovery => {
  const units = unsettled.map(typedUnit);
  if (
    unsettled.length === 0 ||
    !recovery.arguments.some(isInstallSelection) ||
    !units.every((unit) => unit !== undefined)
  ) {
    return recovery;
  }
  return {
    ...recovery,
    arguments: [
      ...recovery.arguments.filter((argument) => !isInstallSelection(argument)),
      ...units.map((unit) =>
        recoveryOption(installSelectorFlag(unit.type), publicRecoveryValue(unit.name)),
      ),
    ],
  };
};

/**
 * A typed update replayed for the units that did not settle: the `--name`
 * selectors it carried give way to the names still waiting. A sweep whose
 * waiting units are not extensions a name can select is replayed as typed.
 */
export const narrowUpdateNames = (
  recovery: ConfirmationRecovery,
  unsettled: ReadonlyArray<ResolvedUnit<unknown>>,
): ConfirmationRecovery => {
  const units = unsettled.map(typedUnit);
  if (unsettled.length === 0 || !units.every((unit) => unit !== undefined)) return recovery;
  return {
    ...recovery,
    arguments: [
      ...recovery.arguments.filter(
        (argument) => argument._tag !== "Option" || argument.flag !== "--name",
      ),
      ...units.map((unit) => recoveryOption("--name", publicRecoveryValue(unit.name))),
    ],
  };
};

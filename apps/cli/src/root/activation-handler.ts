/**
 * The shared enable/disable command factory and handler for every installable
 * extension type. Each route settles activation through the lifecycle feature,
 * previews or applies it, and renders the outcome.
 *
 * Whatever the outcome, the next step a reader is offered starts with the
 * type's own inspection command from the presentation table: after a change,
 * beside a no-op that named nothing to change, and on a refusal that found
 * the named subject missing.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { SetActivation, type SetActivationRequest } from "@agentxm/workspace/lifecycle";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

import { AppError } from "../app-error/index.js";
import { failureToAppError } from "../app-error/conversions.js";
import { ignoreReleaseAgeFlag } from "../cli-flags/index.js";
import { scopeFlag } from "../cli-flags/scope-flag.js";
import { withArgvTracking } from "../cli-runtime/index.js";
import { emitNoOpOutcome, emitOperationResolution } from "../operation-output.js";
import { withReleaseAgePosture, withRuntime, withWorkspace } from "../runtime.js";
import { EXTENSION_TYPE_PRESENTATION } from "./extension-type-presentation.js";
import { makePublicPositionalPlanInvocation } from "./shared/confirmation-recovery.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "./shared/command-capabilities.js";
import { withOperationLifecycle } from "../operation-lifecycle.js";

export interface ActivationRequest {
  readonly name: string;
  readonly enabled: boolean;
  readonly preview: boolean;
}

interface ActivationCommandArgs extends SetActivationRequest {
  readonly preview: boolean;
}

interface ActivationCommandPresentation {
  /** The machine-output command identity, such as `skills.enable`. */
  readonly command: string;
  /** The command path an approval-recovery hint reprints. */
  readonly commandPath: ReadonlyArray<string>;
  readonly planName: string;
  /** What a settled change offers after the type's inspection command. */
  readonly suggestions: ReadonlyArray<SuggestedAction>;
}

const handleSetActivation = (
  args: ActivationCommandArgs,
  presentation: ActivationCommandPresentation,
) =>
  withOperationLifecycle(
    {
      command: presentation.command,
      mode: args.preview ? "preview" : "apply",
      planName: presentation.planName,
      productActivity: { activity: "configure", activationEligible: args.enabled },
    },
    handleSetActivationBody(args, presentation),
  );

export const handleActivation = (type: InstallableExtensionType, request: ActivationRequest) => {
  const { route, noun } = EXTENSION_TYPE_PRESENTATION[type];
  const verb = request.enabled ? "enable" : "disable";
  return handleSetActivation(
    { type, ...request },
    {
      command: `${route}.${verb}`,
      commandPath: [route, verb],
      planName: `${request.enabled ? "Enable" : "Disable"} ${noun.singular}`,
      suggestions: [
        {
          description: "Undo",
          cmd: `axm ${route} ${request.enabled ? "disable" : "enable"} ${request.name}`,
        },
      ],
    },
  );
};

const makeActivationCommand = (type: InstallableExtensionType, enabled: boolean) => {
  const { route, noun, exampleName } = EXTENSION_TYPE_PRESENTATION[type];
  const verb = enabled ? "enable" : "disable";
  const verbTitle = enabled ? "Enable" : "Disable";
  const config = {
    name: Argument.String("name").pipe(
      Argument.withDescription(`Name of the ${noun.singular} to ${verb}`),
    ),
    scope: scopeFlag.pipe(
      Flag.withDescription(`${verbTitle} in project (default) or user-level configuration`),
    ),
    preview: previewCapabilityFlag(
      `Show what would change without ${enabled ? "enabling" : "disabling"}`,
    ),
    ignoreReleaseAge: ignoreReleaseAgeFlag,
  } as const;
  return Command.make(verb, config, ({ name, scope, preview, ignoreReleaseAge }) =>
    handleActivation(type, { name, enabled, preview }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime(`${route} ${verb}`),
    ),
  ).pipe(
    withArgvTracking(config),
    withCommandCapabilities(previewableCapabilities("workspace")),
    Command.withDescription(
      enabled
        ? `Enable a previously disabled ${noun.singular}`
        : `Disable a ${noun.singular} without uninstalling it`,
    ),
    Command.withExamples([
      {
        command: `axm ${route} ${verb} ${exampleName}`,
        description: `${verbTitle} a ${noun.singular}`,
      },
      {
        command: `axm ${route} ${verb} ${exampleName} --preview`,
        description: `Preview ${verb} effects`,
      },
    ]),
  );
};

export const makeActivationCommands = (type: InstallableExtensionType) => ({
  enableCommand: makeActivationCommand(type, true),
  disableCommand: makeActivationCommand(type, false),
});

/**
 * A refusal that found no such subject is answered with the command that
 * lists what the workspace does hold, appended to whatever the feature
 * offered; every other field of the refusal stands as the feature rendered
 * it, and so does every other refusal.
 */
const withInspection = (error: AppError, inspect: SuggestedAction): AppError =>
  error.code === "not_found"
    ? new AppError({
        code: error.code,
        title: error.title,
        detail: error.detail,
        ...(error.metadata === undefined ? {} : { metadata: error.metadata }),
        ...(error.status === undefined ? {} : { status: error.status }),
        ...(error.retryable === undefined ? {} : { retryable: error.retryable }),
        ...(error.blockedOn === undefined ? {} : { blockedOn: error.blockedOn }),
        ...(error.action === undefined ? {} : { action: error.action }),
        ...(error.problem === undefined ? {} : { problem: error.problem }),
        ...(error.inputs === undefined ? {} : { inputs: error.inputs }),
        suggestions: [...(error.suggestions ?? []), inspect],
        cause: error.cause,
      })
    : error;

const handleSetActivationBody = Effect.fn("SetActivation.handle")(function* (
  args: ActivationCommandArgs,
  presentation: ActivationCommandPresentation,
) {
  const { inspect } = EXTENSION_TYPE_PRESENTATION[args.type];
  const candidate = yield* SetActivation.prepare({
    type: args.type,
    name: args.name,
    enabled: args.enabled,
  }).pipe(Effect.mapError((failure) => withInspection(failureToAppError(failure), inspect)));

  if (candidate._tag === "Unchanged") {
    yield* emitNoOpOutcome({
      planName: presentation.planName,
      planDescription: `${args.enabled ? "Enable" : "Disable"} ${candidate.name}`,
      message: candidate.message,
      suggestions: [inspect],
    });
    return;
  }

  const { execution, recovery } = yield* makePublicPositionalPlanInvocation(
    args,
    presentation.commandPath,
    [candidate.name],
  );
  const resolution = yield* SetActivation.previewOrApply(candidate, execution).pipe(
    Effect.mapError(failureToAppError),
  );
  yield* emitOperationResolution(resolution, {
    recovery,
    suggestions: [inspect, ...presentation.suggestions],
  });
});

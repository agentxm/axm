import { withParameterDescription } from "../cli-parameters.js";
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
import { Argument, Command } from "effect/cli";

import {
  resolveRootActivationIntent,
  EnableExtension,
  DisableExtension,
  type EnableExtensionRequest,
  type ActivationCandidate,
  type ActivationUnchanged,
  type ActivationFailure,
  type ActivationExecutionFailure,
} from "@agentxm/workspace-features/lifecycle";
import { ExtensionFqnSchema } from "@agentxm/extension-model/unstable/extensions";
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
  readonly preview: boolean;
}

interface ActivationCommandArgs extends EnableExtensionRequest {
  readonly enabled: boolean;
  readonly preview: boolean;
}

interface ActivationCommandPresentation {
  /** The machine-output command identity, such as `skills.enable`. */
  readonly command: string;
  /** The command path an approval-recovery hint reprints. */
  readonly commandPath: ReadonlyArray<string>;
  readonly planName: string;
  readonly recoveryTarget?: string;
  /** What a settled change offers after the type's inspection command. */
  readonly suggestions: ReadonlyArray<SuggestedAction>;
}

type ActivationPreparer<R> = (
  request: EnableExtensionRequest,
) => Effect.Effect<
  ActivationCandidate | ActivationUnchanged,
  ActivationFailure | ActivationExecutionFailure,
  R
>;

const handleSetActivation = <R>(
  args: ActivationCommandArgs,
  presentation: ActivationCommandPresentation,
  prepare: ActivationPreparer<R>,
) =>
  withOperationLifecycle(
    {
      command: presentation.command,
      mode: args.preview ? "preview" : "apply",
      planName: presentation.planName,
      productActivity: { activity: "configure", activationEligible: args.enabled },
    },
    handleSetActivationBody(args, presentation, prepare),
  );

const typedPresentation = (
  type: InstallableExtensionType,
  request: ActivationRequest,
  enabled: boolean,
): ActivationCommandPresentation => {
  const { route, noun } = EXTENSION_TYPE_PRESENTATION[type];
  const verb = enabled ? "enable" : "disable";
  return {
    command: `${route}.${verb}`,
    commandPath: [route, verb],
    planName: `${enabled ? "Enable" : "Disable"} ${noun.singular}`,
    suggestions: [
      {
        description: "Undo",
        cmd: `axm ${route} ${enabled ? "disable" : "enable"} ${request.name}`,
      },
    ],
  };
};

export const handleEnable = (type: InstallableExtensionType, request: ActivationRequest) =>
  handleSetActivation(
    { type, ...request, enabled: true },
    typedPresentation(type, request, true),
    EnableExtension.prepare,
  );

export const handleDisable = (type: InstallableExtensionType, request: ActivationRequest) =>
  handleSetActivation(
    { type, ...request, enabled: false },
    typedPresentation(type, request, false),
    DisableExtension.prepare,
  );

const makeActivationCommand = (type: InstallableExtensionType, enabled: boolean) => {
  const { route, noun, exampleName } = EXTENSION_TYPE_PRESENTATION[type];
  const verb = enabled ? "enable" : "disable";
  const verbTitle = enabled ? "Enable" : "Disable";
  const config = {
    name: Argument.String("name").pipe(
      withParameterDescription(`Name or FQN of the ${noun.singular} to ${verb}`),
    ),
    scope: scopeFlag,
    preview: previewCapabilityFlag(),
  } as const;
  const describe = <Name extends string, Input, ContextInput, E, R>(
    command: Command.Command<Name, Input, ContextInput, E, R>,
  ) =>
    command.pipe(
      withCommandCapabilities(previewableCapabilities("workspace")),
      Command.withDescription(
        enabled
          ? `Enable a previously disabled ${noun.singular}`
          : `Disable ${noun.article} ${noun.singular} without uninstalling it`,
      ),
      Command.withExamples([
        {
          command: `axm ${route} ${verb} ${exampleName}`,
          description: `${verbTitle} ${noun.article} ${noun.singular}`,
        },
        {
          command: `axm ${route} ${verb} ${exampleName} --preview`,
          description: `Preview ${verb} effects`,
        },
      ]),
    );
  return enabled
    ? (() => {
        const enableConfig = { ...config, ignoreReleaseAge: ignoreReleaseAgeFlag };
        return Command.make("enable", enableConfig, ({ name, scope, preview, ignoreReleaseAge }) =>
          handleEnable(type, { name, preview }).pipe(
            withReleaseAgePosture(ignoreReleaseAge),
            withWorkspace(scope),
            withRuntime(`${route} enable`),
          ),
        ).pipe(withArgvTracking(enableConfig), describe);
      })()
    : Command.make("disable", config, ({ name, scope, preview }) =>
        handleDisable(type, { name, preview }).pipe(
          withWorkspace(scope),
          withRuntime(`${route} disable`),
        ),
      ).pipe(withArgvTracking(config), describe);
};

export const makeActivationCommands = (type: InstallableExtensionType) => ({
  enableCommand: makeActivationCommand(type, true),
  disableCommand: makeActivationCommand(type, false),
});

const makeRootActivationCommand = (enabled: boolean) => {
  const verb = enabled ? "enable" : "disable";
  const title = enabled ? "Enable" : "Disable";
  const config = {
    extension: Argument.String("extension").pipe(
      Argument.withSchema(ExtensionFqnSchema),
      withParameterDescription("Extension FQN in @owner/<plural-type>/<name> form"),
    ),
    scope: scopeFlag,
    preview: previewCapabilityFlag(),
  } as const;
  const runRoot = <R>(extension: string, preview: boolean, prepare: ActivationPreparer<R>) =>
    resolveRootActivationIntent(extension).pipe(
      Effect.mapError(failureToAppError),
      Effect.flatMap(({ type, fqn }) =>
        handleSetActivation(
          { type, name: fqn, enabled, preview },
          {
            command: verb,
            commandPath: [verb],
            recoveryTarget: fqn,
            planName: `${title} ${EXTENSION_TYPE_PRESENTATION[type].noun.singular}`,
            suggestions: [
              { description: "Undo", cmd: `axm ${enabled ? "disable" : "enable"} ${fqn}` },
            ],
          },
          prepare,
        ),
      ),
    );
  const describe = <Name extends string, Input, ContextInput, E, R>(
    command: Command.Command<Name, Input, ContextInput, E, R>,
  ) =>
    command.pipe(
      withCommandCapabilities(previewableCapabilities("workspace")),
      Command.withDescription(
        enabled
          ? "Enable a previously disabled extension"
          : "Disable an extension without uninstalling it",
      ),
      Command.withExamples([
        {
          command: `axm ${verb} @acme/skills/code-review`,
          description: `${title} an extension by FQN`,
        },
        {
          command: `axm ${verb} --preview @acme/hooks/session-audit`,
          description: `Preview ${verb} effects`,
        },
      ]),
    );
  return enabled
    ? (() => {
        const enableConfig = { ...config, ignoreReleaseAge: ignoreReleaseAgeFlag };
        return Command.make(
          "enable",
          enableConfig,
          ({ extension, scope, preview, ignoreReleaseAge }) =>
            runRoot(extension, preview, EnableExtension.prepare).pipe(
              withReleaseAgePosture(ignoreReleaseAge),
              withWorkspace(scope),
              withRuntime("enable"),
            ),
        ).pipe(withArgvTracking(enableConfig), describe);
      })()
    : Command.make("disable", config, ({ extension, scope, preview }) =>
        runRoot(extension, preview, DisableExtension.prepare).pipe(
          withWorkspace(scope),
          withRuntime("disable"),
        ),
      ).pipe(withArgvTracking(config), describe);
};

export const rootEnableCommand = makeRootActivationCommand(true);
export const rootDisableCommand = makeRootActivationCommand(false);

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

const handleSetActivationBody = <R>(
  args: ActivationCommandArgs,
  presentation: ActivationCommandPresentation,
  prepare: ActivationPreparer<R>,
) =>
  Effect.gen(function* () {
    const { inspect } = EXTENSION_TYPE_PRESENTATION[args.type];
    const candidate = yield* prepare({
      type: args.type,
      name: args.name,
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
      [presentation.recoveryTarget ?? candidate.name],
    );
    const resolution = yield* DisableExtension.previewOrApply(candidate, execution).pipe(
      Effect.mapError(failureToAppError),
    );
    yield* emitOperationResolution(resolution, {
      recovery,
      suggestions: [inspect, ...presentation.suggestions],
    });
  });

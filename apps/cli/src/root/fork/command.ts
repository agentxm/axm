import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { ForkExtension, forkExtensionPlanName } from "@agentxm/extension-authoring";
import {
  credentialFreeLocatorRecoveryValue,
  publicRecoveryValue,
  recoveryOption,
  recoveryPositional,
  recoverySwitch,
} from "@agentxm/workspace-operations";

import { isNonInteractiveOptional } from "../../cli-flags/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { authoringFailureToAppError } from "../../feature-errors.js";
import { emitOperationResolution } from "../../operation-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { makeConfirmationRecovery, makePlanExecution } from "../shared/confirmation-recovery.js";
import { withOperationLifecycle } from "../../operation-lifecycle.js";

export interface ForkHandlerArgs {
  readonly source: string;
  readonly target: string;
  readonly from: Option.Option<string>;
  readonly enable: boolean;
  readonly preview: boolean;
}

export const handleFork = (args: ForkHandlerArgs) =>
  withOperationLifecycle(
    {
      command: "fork",
      mode: args.preview ? "preview" : "apply",
      planName: forkExtensionPlanName,
    },
    handleForkBody(args),
  );

const handleForkBody = Effect.fn("Fork.handle")(function* (args: ForkHandlerArgs) {
  const nonInteractive = yield* isNonInteractiveOptional;
  const candidate = yield* ForkExtension.prepare({
    source: args.source,
    target: args.target,
    from: args.from,
    enable: args.enable,
    nonInteractive,
  }).pipe(Effect.mapError(authoringFailureToAppError));

  const execution = yield* makePlanExecution(
    { preview: args.preview },
    makeConfirmationRecovery(
      ["fork"],
      [
        ...Option.match(args.from, {
          onNone: () => [],
          onSome: (value) => [recoveryOption("--from", publicRecoveryValue(value))],
        }),
        recoverySwitch("--enable", args.enable),
        recoveryPositional(credentialFreeLocatorRecoveryValue(args.source)),
        recoveryPositional(publicRecoveryValue(args.target)),
      ],
    ),
  );
  const resolution = yield* ForkExtension.previewOrApply(candidate, execution).pipe(
    Effect.mapError(authoringFailureToAppError),
  );
  yield* emitOperationResolution("fork", resolution);
});

const config = {
  source: Argument.String("source").pipe(
    Argument.withDescription("Registry, workspace, local, or Git AXM package source"),
  ),
  target: Argument.String("extension").pipe(Argument.withDescription("New target FQN")),
  from: Flag.String("from").pipe(
    Flag.withDescription("Source package FQN when the source contains multiple packages"),
    Flag.optional,
  ),
  enable: Flag.Boolean("enable").pipe(
    Flag.withDescription("Enable and materialize a newly forked extension"),
    Flag.withDefault(false),
  ),
  preview: previewCapabilityFlag(),
} as const;

export const forkCommand = Command.make("fork", config, (parsed) =>
  handleFork(parsed).pipe(Effect.scoped, withWorkspace("project"), withRuntime("fork")),
).pipe(
  withArgvTracking(config),
  withCommandCapabilities(previewableCapabilities("authored-source")),
  Command.withDescription("Fork a managed AXM package into project-workspace authorship"),
  Command.withExamples([
    {
      command: "axm fork @acme/skills/review @me/skills/review-custom",
      description: "Fork a Registry skill as a disabled workspace-authored package",
    },
    {
      command:
        "axm fork ./extensions @me/hooks/check-policy --from @acme/hooks/check-policy --enable",
      description: "Fork one package from a local collection and enable it",
    },
  ]),
);

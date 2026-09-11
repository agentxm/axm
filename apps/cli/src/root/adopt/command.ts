import * as Effect from "effect/Effect";
import { Argument, Command } from "effect/unstable/cli";

import { AdoptExtension, adoptExtensionPlanName } from "@agentxm/extension-authoring";

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
import { makePublicPositionalPlanExecution } from "../shared/confirmation-recovery.js";
import { withOperationLifecycle } from "../../operation-lifecycle.js";

export interface AdoptHandlerArgs {
  readonly fqn: string;
  readonly preview: boolean;
}

export const handleAdopt = (args: AdoptHandlerArgs) =>
  withOperationLifecycle(
    {
      command: "adopt",
      mode: args.preview ? "preview" : "apply",
      planName: adoptExtensionPlanName,
    },
    handleAdoptBody(args),
  );

const handleAdoptBody = Effect.fn("Adopt.handle")(function* (args: AdoptHandlerArgs) {
  const nonInteractive = yield* isNonInteractiveOptional;
  const candidate = yield* AdoptExtension.prepare({ fqn: args.fqn, nonInteractive }).pipe(
    Effect.mapError(authoringFailureToAppError),
  );
  const execution = yield* makePublicPositionalPlanExecution(
    { preview: args.preview },
    ["adopt"],
    [args.fqn],
  );
  const resolution = yield* AdoptExtension.previewOrApply(candidate, execution).pipe(
    Effect.mapError(authoringFailureToAppError),
  );
  yield* emitOperationResolution("adopt", resolution);
});

const config = {
  fqn: Argument.String("extension").pipe(
    Argument.withDescription("Canonical extension FQN (@owner/<plural-type>/name)"),
  ),
  preview: previewCapabilityFlag(),
} as const;

export const adoptCommand = Command.make("adopt", config, ({ fqn, preview }) =>
  handleAdopt({ fqn, preview }).pipe(withWorkspace("project"), withRuntime("adopt")),
).pipe(
  withArgvTracking(config),
  withCommandCapabilities(previewableCapabilities("authored-source")),
  Command.withDescription("Adopt a canonical package into project-workspace authorship"),
  Command.withExamples([
    {
      command: "axm adopt @acme/skills/code-review",
      description: "Adopt an unmanaged or retained package for authoring",
    },
  ]),
);

import { withParameterDescription } from "../../cli-parameters.js";
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/cli";
import { ConfigureHook } from "@agentxm/workspace-features/configuration";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { failureToAppError } from "../../app-error/conversions.js";
import { emitOperationResolution } from "../../operation-output.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { makePlanInvocation } from "../shared/confirmation-recovery.js";
import { withOperationLifecycle } from "../../operation-lifecycle.js";
import { parseHookConfiguration } from "./configuration-input.js";

export const handleHookConfigure = (args: {
  readonly name: string;
  readonly configuration: string;
  readonly preview: boolean;
}) =>
  withOperationLifecycle(
    {
      command: "hooks.configure",
      mode: args.preview ? "preview" : "apply",
      planName: "Configure hook extension",
    },
    Effect.gen(function* () {
      const configuration = yield* parseHookConfiguration(args.configuration);
      const candidate = yield* ConfigureHook.prepare({ name: args.name, configuration }).pipe(
        Effect.mapError(failureToAppError),
      );
      const { execution, recovery } = yield* makePlanInvocation(
        { preview: args.preview },
        { command: [], arguments: [] },
      );
      const resolution = yield* ConfigureHook.previewOrApply(candidate, execution).pipe(
        Effect.mapError(failureToAppError),
      );
      yield* emitOperationResolution(resolution, { recovery });
    }),
  );
const config = {
  name: Argument.String("name").pipe(
    withParameterDescription("Name of the hook extension to configure"),
  ),
  configuration: Flag.String("configuration").pipe(
    withParameterDescription(
      "Replace consumer values as a JSON object; {env: NAME} references a secret",
    ),
  ),
  preview: previewCapabilityFlag(),
  scope: scopeFlag,
} as const;
export const configureCommand = Command.make("configure", config, (args) =>
  handleHookConfigure(args).pipe(withWorkspace(args.scope), withRuntime("hooks configure")),
).pipe(
  withArgvTracking(config),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription(
    "Configure an installed hook extension without changing its content or acquisition intent",
  ),
  Command.withExamples([
    {
      command: "axm hooks configure tool-audit --configuration '{}' --preview",
      description: "Preview configuration using publisher defaults",
    },
  ]),
);

import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
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
      planName: "Configure hook",
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
  name: Argument.String("name"),
  configuration: Flag.String("configuration").pipe(
    Flag.withDescription(
      "Replace consumer values with this JSON object; omitted keys use publisher defaults",
    ),
  ),
  preview: previewCapabilityFlag("Validate values and describe native changes without applying"),
  scope: scopeFlag,
} as const;
export const configureCommand = Command.make("configure", config, (args) =>
  handleHookConfigure(args).pipe(withWorkspace(args.scope), withRuntime("hooks configure")),
).pipe(
  withArgvTracking(config),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription(
    "Configure an installed Hook without changing package content or acquisition intent",
  ),
  Command.withExamples([
    {
      command: "axm hooks configure tool-audit --configuration '{}' --preview",
      description: "Preview configuration using publisher defaults",
    },
  ]),
);

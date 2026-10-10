import { withParameterDescription } from "../../cli-parameters.js";
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/cli";
import { ExportHook } from "@agentxm/workspace-features/authoring";
import {
  publicRecoveryValue,
  recoveryOption,
  recoveryPositional,
} from "@agentxm/workspace-kernel/operations";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { failureToAppError } from "../../app-error/conversions.js";
import { emitOperationResolution } from "../../operation-output.js";
import { withOperationLifecycle } from "../../operation-lifecycle.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { makeConfirmationRecovery, makePlanInvocation } from "../shared/confirmation-recovery.js";

export const handleHookExport = (args: {
  readonly directory: string;
  readonly destination: string;
  readonly implementation: string;
  readonly preview: boolean;
}) =>
  withOperationLifecycle(
    { command: "hooks.export", mode: args.preview ? "preview" : "apply", planName: "Export hook" },
    Effect.gen(function* () {
      const candidate = yield* ExportHook.prepare(args).pipe(Effect.mapError(failureToAppError));
      const { execution, recovery } = yield* makePlanInvocation(
        { preview: args.preview },
        makeConfirmationRecovery(
          ["hooks", "export"],
          [
            recoveryPositional(publicRecoveryValue(args.directory)),
            recoveryPositional(publicRecoveryValue(args.destination)),
            recoveryOption("--implementation", publicRecoveryValue(args.implementation)),
          ],
        ),
      );
      const resolution = yield* ExportHook.previewOrApply(candidate, execution).pipe(
        Effect.mapError(failureToAppError),
      );
      yield* emitOperationResolution(resolution, { recovery });
    }),
  );

const config = {
  directory: Argument.String("directory").pipe(
    withParameterDescription("Hook extension directory"),
  ),
  destination: Argument.String("destination").pipe(
    withParameterDescription("New directory under an existing workspace parent"),
  ),
  implementation: Flag.String("implementation").pipe(
    withParameterDescription("Exact implementation ID to export"),
  ),
  preview: previewCapabilityFlag(),
} as const;

export const exportCommand = Command.make("export", config, (args) =>
  handleHookExport(args).pipe(Effect.scoped, withWorkspace("project"), withRuntime("hooks export")),
).pipe(
  withArgvTracking(config),
  withCommandCapabilities(previewableCapabilities("authored-source")),
  Command.withDescription("Export a self-contained native command bundle without activation"),
  Command.withExamples([
    {
      command: "axm hooks export hooks/audit ./native-audit --implementation native --preview",
      description: "Preview a native bundle in a new directory",
    },
  ]),
);

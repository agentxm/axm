import { HOOK_PROTOCOLS } from "./protocols.js";
import { withParameterDefault, withParameterDescription } from "../../cli-parameters.js";
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/cli";
import {
  ImportNativeExtension,
  importNativeExtensionPlanName,
  type ImportNativeHookRequest,
} from "@agentxm/workspace-features/authoring";
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

export const handleHookImport = (args: {
  readonly directory: string;
  readonly target: string;
  readonly protocol: ImportNativeHookRequest["protocol"];
  readonly file: string;
  readonly resource: ReadonlyArray<string>;
  readonly preview: boolean;
}) =>
  withOperationLifecycle(
    {
      command: "hooks.import",
      mode: args.preview ? "preview" : "apply",
      planName: importNativeExtensionPlanName("hook"),
    },
    Effect.gen(function* () {
      const candidate = yield* ImportNativeExtension.prepare({
        type: "hook",
        source: args.directory,
        target: args.target,
        protocol: args.protocol,
        configPath: args.file,
        resources: args.resource,
        enable: false,
      }).pipe(Effect.mapError(failureToAppError));
      const { execution, recovery } = yield* makePlanInvocation(
        { preview: args.preview },
        makeConfirmationRecovery(
          ["hooks", "import"],
          [
            recoveryPositional(publicRecoveryValue(args.directory)),
            recoveryPositional(publicRecoveryValue(args.target)),
            recoveryOption("--protocol", publicRecoveryValue(args.protocol)),
            recoveryOption("--file", publicRecoveryValue(args.file)),
            ...args.resource.map((resource) =>
              recoveryOption("--resource", publicRecoveryValue(resource)),
            ),
          ],
        ),
      );
      const resolution = yield* ImportNativeExtension.previewOrApply(candidate, execution).pipe(
        Effect.mapError(failureToAppError),
      );
      yield* emitOperationResolution(resolution, { recovery });
    }),
  );

const config = {
  directory: Argument.String("directory").pipe(withParameterDescription("Native bundle directory")),
  target: Argument.String("extension").pipe(
    withParameterDescription("New managed hook extension FQN"),
  ),
  protocol: Flag.Literals("protocol", HOOK_PROTOCOLS).pipe(
    withParameterDescription("Native protocol of the source definitions"),
  ),
  file: Flag.String("file").pipe(
    withParameterDefault("hooks.json"),
    withParameterDescription("JSON file relative to <directory>"),
  ),
  resource: Flag.String("resource").pipe(
    Flag.atLeast(0),
    withParameterDescription("Additional package-relative resource file"),
  ),
  preview: previewCapabilityFlag(),
} as const;

export const importCommand = Command.make("import", config, (args) =>
  handleHookImport(args).pipe(Effect.scoped, withWorkspace("project"), withRuntime("hooks import")),
).pipe(
  withArgvTracking(config),
  withCommandCapabilities(previewableCapabilities("authored-source")),
  Command.withDescription(
    "Import a native command bundle as an inactive hook extension; original registrations remain",
  ),
  Command.withShortDescription("Import hooks and retain original registrations"),
  Command.withExamples([
    {
      command: "axm hooks import --protocol claude-code --preview ./native-hooks @me/hooks/audit",
      description: "Preview a nonexecuting native bundle import",
    },
  ]),
);

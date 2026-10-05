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
  readonly source: string;
  readonly target: string;
  readonly protocol: ImportNativeHookRequest["protocol"];
  readonly config: string;
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
        source: args.source,
        target: args.target,
        protocol: args.protocol,
        configPath: args.config,
        resources: args.resource,
        enable: false,
      }).pipe(Effect.mapError(failureToAppError));
      const { execution, recovery } = yield* makePlanInvocation(
        { preview: args.preview },
        makeConfirmationRecovery(
          ["hooks", "import"],
          [
            recoveryPositional(publicRecoveryValue(args.source)),
            recoveryPositional(publicRecoveryValue(args.target)),
            recoveryOption("--protocol", publicRecoveryValue(args.protocol)),
            recoveryOption("--config", publicRecoveryValue(args.config)),
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
  source: Argument.String("source").pipe(Argument.withDescription("Local native bundle directory")),
  target: Argument.String("extension").pipe(Argument.withDescription("New managed Hook FQN")),
  protocol: Flag.Literals("protocol", [
    "claude-code",
    "codex",
    "cursor",
    "gemini-cli",
    "qwen-code",
    "qoder",
    "codebuddy",
    "augment",
    "devin",
  ] as const).pipe(Flag.withDescription("Native protocol of the source definitions")),
  config: Flag.String("config").pipe(
    Flag.withDefault("hooks.json"),
    Flag.withDescription("JSON file relative to the bundle directory"),
  ),
  resource: Flag.String("resource").pipe(
    Flag.atLeast(0),
    Flag.withDescription("Additional package-relative resource file; repeatable"),
  ),
  preview: previewCapabilityFlag("Validate and preview import without creating a package"),
} as const;

export const importCommand = Command.make("import", config, (args) =>
  handleHookImport(args).pipe(Effect.scoped, withWorkspace("project"), withRuntime("hooks import")),
).pipe(
  withArgvTracking(config),
  withCommandCapabilities(previewableCapabilities("authored-source")),
  Command.withDescription(
    "Import a native command bundle as an inactive Hook; original registrations remain",
  ),
  Command.withExamples([
    {
      command: "axm hooks import ./native-hooks @me/hooks/audit --protocol claude-code --preview",
      description: "Preview a nonexecuting native bundle import",
    },
  ]),
);

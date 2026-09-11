import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { ImportNativeExtension, importNativeExtensionPlanName } from "@agentxm/extension-authoring";
import { extensionTypeToPlural } from "@agentxm/extension-model/unstable/extensions";
import {
  credentialFreeLocatorRecoveryValue,
  publicRecoveryValue,
  recoveryPositional,
  recoverySwitch,
} from "@agentxm/workspace-operations";

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
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";

/** The types whose native content this route converts. */
type NativeImportRouteType = "skill" | "subagent";

interface ImportHandlerArgs {
  readonly type: NativeImportRouteType;
  readonly source: string;
  readonly target: string;
  readonly enable: boolean;
  readonly preview: boolean;
}

export const handleImport = (args: ImportHandlerArgs) =>
  withOperationLifecycle(
    {
      command: `${extensionTypeToPlural[args.type]} import`,
      mode: args.preview ? "preview" : "apply",
      planName: importNativeExtensionPlanName(args.type),
    },
    handleImportBody(args),
  );

const handleImportBody = Effect.fn("Import.handle")(function* (args: ImportHandlerArgs) {
  const group = extensionTypeToPlural[args.type];
  const candidate = yield* ImportNativeExtension.prepare({
    type: args.type,
    source: args.source,
    target: args.target,
    enable: args.enable,
  }).pipe(Effect.mapError(authoringFailureToAppError));

  const execution = yield* makePlanExecution(
    { preview: args.preview },
    makeConfirmationRecovery(
      [group, "import"],
      [
        recoverySwitch("--enable", args.enable),
        recoveryPositional(credentialFreeLocatorRecoveryValue(args.source)),
        recoveryPositional(publicRecoveryValue(args.target)),
      ],
    ),
  );
  const resolution = yield* ImportNativeExtension.previewOrApply(candidate, execution).pipe(
    Effect.mapError(authoringFailureToAppError),
  );
  yield* emitOperationResolution(`${group} import`, resolution);
});

const config = {
  source: Argument.string("source").pipe(
    Argument.withDescription("Local or Git native extension source"),
  ),
  target: Argument.string("extension").pipe(Argument.withDescription("New managed target FQN")),
  enable: Flag.boolean("enable").pipe(
    Flag.withDescription("Enable and materialize a newly imported extension"),
    Flag.withDefault(false),
  ),
  preview: previewCapabilityFlag(),
} as const;

const makeNativeImportCommand = (type: NativeImportRouteType) => {
  const group = extensionTypeToPlural[type];
  const noun = type === "skill" ? "skill" : "subagent";
  return Command.make("import", config, (parsed) =>
    handleImport({ ...parsed, type }).pipe(
      Effect.scoped,
      withWorkspace("project"),
      withRuntime(`${group} import`),
    ),
  ).pipe(
    withArgvTracking(config),
    withCommandCapabilities(previewableCapabilities("authored-source")),
    Command.withDescription(
      `Convert a native ${noun} into a project-workspace AXM ${noun} package`,
    ),
    Command.withExamples([
      {
        command:
          type === "skill"
            ? "axm skills import ./review-skill @me/skills/review --enable"
            : "axm subagents import .claude/agents/reviewer.md @me/subagents/reviewer",
        description: `Import a native ${noun} without modifying the original source`,
      },
    ]),
  );
};

export const skillsImportCommand = makeNativeImportCommand("skill");
export const subagentsImportCommand = makeNativeImportCommand("subagent");

import { LearnMore, formatLearnMore } from "../formatter.js";
import { withParameterDefault, withParameterDescription } from "../cli-parameters.js";
import { Argument, Command, Flag } from "effect/cli";
import * as Effect from "effect/Effect";
import { withArgvTracking } from "../cli-runtime/index.js";
import { emitResult, inventoryDoc, type ViewColumn } from "../screen/index.js";
import {
  InstructionsStatusSchema,
  ManageInstructions,
  AdoptInstructionRegion,
  type InstructionsStatus,
} from "@agentxm/workspace-features/configuration";
import { emitNoOpOutcome, emitOperationResolution } from "../operation-output.js";
import { scopeFlag } from "../cli-flags/scope-flag.js";
import { withProjectionOutputPosture, withRuntime, withWorkspace } from "../runtime.js";
import { discardModifiedFlag, replaceUnrecordedFlag } from "../cli-flags/index.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  readOnlyCapabilities,
  groupCapabilities,
  withCommandCapabilities,
} from "./shared/command-capabilities.js";
import { withLiveOperation, withOperationLifecycle } from "../operation-lifecycle.js";
import { makePlanInvocation } from "./shared/confirmation-recovery.js";
import { failureToAppError } from "../app-error/conversions.js";

/**
 * The name this command's machine document is registered under in
 * `machine-output-contracts.ts`. The document itself is the configuration
 * feature's typed status report; the registry names it, so the name stays.
 */
export const InstructionsStatusOutputSchema = InstructionsStatusSchema;

type InstructionStatusRow = InstructionsStatus["items"][number];

const InstructionsColumns = [
  { header: "Agent", priority: "required", value: (row: InstructionStatusRow) => row.agentId },
  { header: "Mode", value: (row: InstructionStatusRow) => row.mechanism },
  { header: "Status", value: (row: InstructionStatusRow) => row.health },
  {
    header: "Ownership",
    priority: "optional",
    value: (row: InstructionStatusRow) => row.ownership,
  },
  { header: "Source", priority: "optional", value: (row: InstructionStatusRow) => row.sourceFile },
  { header: "Target", value: (row: InstructionStatusRow) => row.targetFile },
] satisfies ReadonlyArray<ViewColumn<InstructionStatusRow>>;

export const handleInstructionsStatus = Effect.fn("Instructions.inspect")(function* () {
  const status = yield* withLiveOperation(
    {
      name: "Inspect instruction-file management",
      mode: "query",
    },
    ManageInstructions.status().pipe(Effect.mapError(failureToAppError)),
  );

  yield* emitResult(status, InstructionsStatusSchema, () => {
    if (!status.enabled) {
      return inventoryDoc({
        rows: [],
        columns: InstructionsColumns,
        empty: "Instruction-file management is disabled.",
      });
    }

    // Stale rows follow the configured rows so residue AXM still owns is visible
    // beside the targets it currently maintains.
    const rows = [...status.items, ...status.staleTargets];
    return inventoryDoc({
      rows,
      columns: InstructionsColumns,
      summary:
        rows.length === 0
          ? ""
          : `${String(rows.length)} instruction ${rows.length === 1 ? "file" : "files"}`,
      empty: "No configured agents need instruction-file propagation.",
    });
  });
});

const PLAN_NAME = {
  enable: "Enable instruction-file management",
  disable: "Disable instruction-file management",
} as const;

const handleInstructionsEnable = (args: {
  readonly fileName: string;
  readonly gitignore: boolean;
  readonly preview?: boolean;
}) =>
  withOperationLifecycle(
    {
      mode: args.preview === true ? "preview" : "apply",
      planName: PLAN_NAME.enable,
    },
    runInstructions(args.preview === true, {
      action: "enable",
      fileName: args.fileName,
      gitignoreAliases: args.gitignore,
    }),
  );

export const handleInstructionsDisable = (args?: { readonly preview?: boolean }) =>
  withOperationLifecycle(
    {
      mode: args?.preview === true ? "preview" : "apply",
      planName: PLAN_NAME.disable,
    },
    runInstructions(args?.preview === true, { action: "disable" }),
  );

const runInstructions = (
  preview: boolean,
  request: Parameters<typeof ManageInstructions.prepare>[0],
) =>
  Effect.gen(function* () {
    const candidate = yield* ManageInstructions.prepare(request).pipe(
      Effect.mapError(failureToAppError),
    );
    if (candidate._tag === "Unchanged") {
      yield* emitNoOpOutcome({
        planName: PLAN_NAME[candidate.action],
        message: candidate.message,
      });
      return;
    }
    const { execution, recovery } = yield* makePlanInvocation(
      { preview },
      { command: [], arguments: [] },
    );
    const resolution = yield* ManageInstructions.previewOrApply(candidate, execution).pipe(
      Effect.mapError(failureToAppError),
    );
    yield* emitOperationResolution(resolution, { recovery });
  });

const instructionsStatusConfig = {
  scope: scopeFlag,
} as const;

const instructionsEnableConfig = {
  scope: scopeFlag,
  fileName: Flag.String("file").pipe(
    withParameterDescription("Source-of-truth instruction file"),
    withParameterDefault("AGENTS.md"),
  ),
  gitignore: Flag.Boolean("gitignore").pipe(
    withParameterDescription(
      "Manage propagated alias files in .gitignore; disable with --no-gitignore",
    ),
    withParameterDefault(true),
  ),
  preview: previewCapabilityFlag(),
  replaceUnrecorded: replaceUnrecordedFlag,
  discardModified: discardModifiedFlag,
} as const;

const instructionsDisableConfig = {
  scope: scopeFlag,
  preview: previewCapabilityFlag(),
  discardModified: discardModifiedFlag,
} as const;

const instructionsAdoptConfig = {
  region: Argument.Literals("region", ["rules", "knowledge"]).pipe(
    withParameterDescription("Region of the planned instruction file to adopt"),
  ),
  scope: scopeFlag,
  preview: previewCapabilityFlag(),
} as const;

const instructionsAdoptCommand = Command.make(
  "adopt",
  instructionsAdoptConfig,
  ({ region, scope, preview }) =>
    withOperationLifecycle(
      {
        mode: preview ? "preview" : "apply",
        planName: "Adopt instruction region",
      },
      Effect.gen(function* () {
        const candidate = yield* AdoptInstructionRegion.prepare({ region }).pipe(
          Effect.mapError(failureToAppError),
        );
        const { execution, recovery } = yield* makePlanInvocation(
          { preview },
          { command: [], arguments: [] },
        );
        const result = yield* AdoptInstructionRegion.previewOrApply(candidate, execution).pipe(
          Effect.mapError(failureToAppError),
        );
        yield* emitOperationResolution(result, { recovery });
      }),
    ).pipe(withWorkspace(scope), withRuntime()),
).pipe(
  withArgvTracking(instructionsAdoptConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription("Record an existing instruction region as current without replacing it"),
  Command.withExamples([
    {
      command: "axm instructions adopt knowledge --preview",
      description: "Review recording one existing Knowledge region as current",
    },
  ]),
);

const instructionsEnableCommand = Command.make(
  "enable",
  instructionsEnableConfig,
  ({ scope, fileName, gitignore, preview, replaceUnrecorded, discardModified }) =>
    handleInstructionsEnable({ fileName, gitignore, preview }).pipe(
      withProjectionOutputPosture({ replaceUnrecorded, discardModified }),
      withWorkspace(scope),
      withRuntime(),
    ),
).pipe(
  withArgvTracking(instructionsEnableConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription("Enable instruction-file management"),
  Command.withExamples([
    { command: "axm instructions enable", description: "Enable instruction files" },
    {
      command: "axm instructions enable --no-gitignore",
      description: "Enable without writing alias gitignore entries",
    },
  ]),
);

const instructionsDisableCommand = Command.make(
  "disable",
  instructionsDisableConfig,
  ({ scope, preview, discardModified }) =>
    handleInstructionsDisable({ preview }).pipe(
      withProjectionOutputPosture({ discardModified }),
      withWorkspace(scope),
      withRuntime(),
    ),
).pipe(
  withArgvTracking(instructionsDisableConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription("Disable instruction-file management"),
  Command.withExamples([
    { command: "axm instructions disable", description: "Disable instruction files" },
  ]),
);

const instructionsStatusCommand = Command.make("status", instructionsStatusConfig, ({ scope }) =>
  handleInstructionsStatus().pipe(withWorkspace(scope), withRuntime()),
).pipe(
  withArgvTracking(instructionsStatusConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("Inspect workspace instruction-file management"),
  Command.withExamples([
    { command: "axm instructions status", description: "Inspect instruction files" },
    {
      command: "axm instructions enable --preview",
      description: "Preview instruction-file management",
    },
  ]),
);

export const instructionsCommand = Command.make("instructions").pipe(
  withCommandCapabilities(groupCapabilities),
  Command.annotate(
    LearnMore,
    formatLearnMore([["axm help instructions", "Read the instructions guide"]]),
  ),
  Command.withDescription("Inspect and manage workspace instruction files"),
  Command.withExamples([
    { command: "axm instructions status", description: "Inspect instruction-file management" },
    {
      command: "axm instructions enable --preview",
      description: "Preview instruction-file management",
    },
  ]),
  Command.withSubcommands([
    instructionsStatusCommand,
    instructionsEnableCommand,
    instructionsDisableCommand,
    instructionsAdoptCommand,
  ]),
);

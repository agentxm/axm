import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { withArgvTracking } from "../cli-runtime/index.js";
import { Screen, inventoryDoc, type ViewColumn } from "../screen/index.js";
import {
  InstructionsStatusSchema,
  ManageInstructions,
  type InstructionsStatus,
} from "@agentxm/workspace-configuration";
import { emitOperationResolution } from "../operation-output.js";
import { scopeFlag } from "../cli-flags/scope-flag.js";
import { withRuntime, withWorkspace } from "../runtime.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  readOnlyCapabilities,
  withCommandCapabilities,
} from "./shared/command-capabilities.js";
import { withOperationLifecycle } from "../operation-lifecycle.js";
import { emitNoOpOutcome } from "./shared/no-op-output.js";
import { makePlanExecution } from "./shared/confirmation-recovery.js";
import { configurationFailureToAppError } from "../feature-errors.js";

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
  const screen = yield* Screen;
  const status = yield* ManageInstructions.status().pipe(
    Effect.mapError(configurationFailureToAppError),
  );

  if (yield* screen.document(status, InstructionsStatusSchema)) return;

  if (!status.enabled) {
    yield* screen.result(
      inventoryDoc({
        rows: [],
        columns: InstructionsColumns,
        summary: "",
        empty: "Instruction-file management is disabled.",
      }),
    );
    return;
  }

  // Stale rows follow the configured rows so residue AXM still owns is visible
  // beside the targets it currently maintains.
  const rows = [...status.items, ...status.staleTargets];
  yield* screen.result(
    inventoryDoc({
      rows,
      columns: InstructionsColumns,
      summary:
        rows.length === 0
          ? ""
          : `${String(rows.length)} instruction ${rows.length === 1 ? "file" : "files"}`,
      empty: "No configured agents need instruction-file propagation.",
    }),
  );
});

const PLAN_NAME = {
  enable: "Enable instruction-file management",
  disable: "Disable instruction-file management",
} as const;

export const handleInstructionsEnable = (args: {
  readonly fileName: string;
  readonly gitignore: boolean;
  readonly preview?: boolean;
}) =>
  withOperationLifecycle(
    {
      command: "instructions.enable",
      mode: args.preview === true ? "preview" : "apply",
      planName: PLAN_NAME.enable,
    },
    runInstructions("instructions.enable", args.preview === true, {
      action: "enable",
      fileName: args.fileName,
      gitignoreAliases: args.gitignore,
    }),
  );

export const handleInstructionsDisable = (args?: { readonly preview?: boolean }) =>
  withOperationLifecycle(
    {
      command: "instructions.disable",
      mode: args?.preview === true ? "preview" : "apply",
      planName: PLAN_NAME.disable,
    },
    runInstructions("instructions.disable", args?.preview === true, { action: "disable" }),
  );

const runInstructions = (
  command: "instructions.enable" | "instructions.disable",
  preview: boolean,
  request: Parameters<typeof ManageInstructions.prepare>[0],
) =>
  Effect.gen(function* () {
    const candidate = yield* ManageInstructions.prepare(request).pipe(
      Effect.mapError(configurationFailureToAppError),
    );
    if (candidate._tag === "Unchanged") {
      yield* emitNoOpOutcome(command, {
        planName: PLAN_NAME[candidate.action],
        message: candidate.message,
        withoutSuggestions: true,
      });
      return;
    }
    const execution = yield* makePlanExecution({ preview }, { command: [], arguments: [] }, []);
    const resolution = yield* ManageInstructions.previewOrApply(candidate, execution).pipe(
      Effect.mapError(configurationFailureToAppError),
    );
    yield* emitOperationResolution(command, resolution);
  });

const instructionsStatusConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Inspect project (default) or user-level configuration"),
  ),
} as const;

const instructionsEnableConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Enable project (default) or user-level configuration"),
  ),
  fileName: Flag.String("file").pipe(
    Flag.withDescription("Source-of-truth instruction file"),
    Flag.withDefault("AGENTS.md"),
  ),
  gitignore: Flag.Boolean("gitignore").pipe(
    Flag.withDescription("Manage propagated alias files in .gitignore"),
    Flag.withDefault(true),
  ),
  preview: previewCapabilityFlag("Show what would change without enabling"),
} as const;

const instructionsDisableConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Disable project (default) or user-level configuration"),
  ),
  preview: previewCapabilityFlag("Show what would change without disabling"),
} as const;

const instructionsEnableCommand = Command.make(
  "enable",
  instructionsEnableConfig,
  ({ scope, fileName, gitignore, preview }) =>
    handleInstructionsEnable({ fileName, gitignore, preview }).pipe(
      withWorkspace(scope),
      withRuntime("instructions enable"),
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
  ({ scope, preview }) =>
    handleInstructionsDisable({ preview }).pipe(
      withWorkspace(scope),
      withRuntime("instructions disable"),
    ),
).pipe(
  withArgvTracking(instructionsDisableConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription("Disable instruction-file management"),
  Command.withExamples([
    { command: "axm instructions disable", description: "Disable instruction files" },
  ]),
);

export const instructionsCommand = Command.make(
  "instructions",
  instructionsStatusConfig,
  ({ scope }) => handleInstructionsStatus().pipe(withWorkspace(scope), withRuntime("instructions")),
).pipe(
  withArgvTracking(instructionsStatusConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("Inspect and manage workspace instruction files"),
  Command.withExamples([
    { command: "axm instructions", description: "Inspect instruction files" },
    {
      command: "axm sync --preview",
      description: "Preview instruction-file reconciliation",
    },
  ]),
  Command.withSubcommands([instructionsEnableCommand, instructionsDisableCommand]),
);

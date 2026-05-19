import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  getInstructionsStatus,
  resolveInstructionsConfig,
  syncInstructions,
  type InstructionGitignoreMode,
} from "@agentxm/client-core/unstable/agents";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  CliRenderer,
  registerEntity,
  type TableView,
} from "@agentxm/client-core/unstable/cli-renderer";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

const gitignoreModes = ["off", "managed", "local"] as const;

interface InstructionTableItem {
  readonly agentId: string;
  readonly mechanism: string;
  readonly health: string;
  readonly sourceFile: string;
  readonly targetFile: string;
}

const InstructionStatusItemSchema = Schema.Struct({
  root: Schema.String,
  agentId: Schema.String,
  agentName: Schema.String,
  sourceFile: Schema.String,
  targetFile: Schema.String,
  mechanism: Schema.String,
  health: Schema.String,
  details: Schema.String,
});

const InstructionsStatusOutputSchema = Schema.Struct({
  enabled: Schema.Boolean,
  sourceFileName: Schema.String,
  gitignore: Schema.String,
  roots: Schema.Array(Schema.String),
  items: Schema.Array(InstructionStatusItemSchema),
});

const InstructionsSyncOutputSchema = Schema.Struct({
  status: InstructionsStatusOutputSchema,
  written: Schema.Array(Schema.String),
  skipped: Schema.Array(Schema.String),
});

const InstructionsTable = {
  columns: {
    agentId: { header: "Agent" },
    mechanism: { header: "Mode" },
    health: { header: "Status" },
    sourceFile: { header: "Source" },
    targetFile: { header: "Target" },
  },
} as const satisfies TableView<InstructionTableItem>;

registerEntity<InstructionTableItem>("agent-instruction", {
  list: {
    columns: InstructionsTable.columns,
    emptyMessage: "No instruction files configured",
  },
});

const currentInstructionsConfig = Effect.fn("Agents.instructions.currentConfig")(function* () {
  const ws = yield* WorkspaceMutations;
  const config = yield* ws.getInstructionsConfig();
  if (Option.isNone(config) || config.value === false) return Option.none();
  return Option.some(resolveInstructionsConfig(config.value));
});

export const handleInstructionsStatus = Effect.fn("Agents.instructions.status")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const config = yield* currentInstructionsConfig();

  if (Option.isNone(config)) {
    const output = {
      enabled: false,
      sourceFileName: "AGENTS.md",
      gitignore: "off",
      roots: [],
      items: [],
    };
    if (yield* renderer.result(output, InstructionsStatusOutputSchema)) return;
    yield* renderer.info("Instruction-file management is disabled.");
    return;
  }

  const configuredAgents = yield* ws.getConfiguredAgents();
  const status = yield* getInstructionsStatus({
    workspaceRoot: ws.baseDir,
    configuredAgents,
    config: config.value,
  });

  if (yield* renderer.result(status, InstructionsStatusOutputSchema)) return;
  if (status.items.length === 0) {
    yield* renderer.info("No configured agents need instruction-file propagation.");
    return;
  }
  const tableItems = status.items.map(
    (item): InstructionTableItem => ({
      agentId: item.agentId,
      mechanism: item.mechanism,
      health: item.health,
      sourceFile: item.sourceFile,
      targetFile: item.targetFile,
    }),
  );
  yield* renderer.table(tableItems, InstructionsTable, "Agent instructions");
});

export const handleInstructionsSync = Effect.fn("Agents.instructions.sync")(function* (args: {
  readonly force: boolean;
  readonly dryRun: boolean;
}) {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const config = yield* currentInstructionsConfig();
  if (Option.isNone(config)) {
    return yield* makeAppError({
      code: "validation",
      detail: "Instruction-file management is disabled.",
      suggestions: [{ description: "Enable it first.", cmd: "axm agents instructions enable" }],
    });
  }

  const configuredAgents = yield* ws.getConfiguredAgents();
  const result = yield* syncInstructions({
    workspaceRoot: ws.baseDir,
    configuredAgents,
    config: config.value,
    force: args.force,
    dryRun: args.dryRun,
  });

  if (yield* renderer.result(result, InstructionsSyncOutputSchema)) return;
  if (args.dryRun) {
    yield* renderer.info(`Would update ${result.written.length} instruction file(s).`);
    return;
  }
  yield* renderer.success(`Updated ${result.written.length} instruction file(s).`);
});

export const handleInstructionsDoctor = Effect.fn("Agents.instructions.doctor")(function* (args: {
  readonly fix: boolean;
}) {
  if (args.fix) {
    return yield* handleInstructionsSync({ force: false, dryRun: false });
  }
  return yield* handleInstructionsStatus();
});

export const handleInstructionsEnable = Effect.fn("Agents.instructions.enable")(function* (args: {
  readonly fileName: string;
  readonly gitignore: InstructionGitignoreMode;
}) {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  yield* ws.setInstructionsConfig({
    fileName: args.fileName,
    gitignore: args.gitignore,
  });
  yield* renderer.success("Instruction-file management enabled.");
});

export const handleInstructionsDisable = Effect.fn("Agents.instructions.disable")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  yield* ws.setInstructionsConfig(false);
  yield* renderer.success("Instruction-file management disabled.");
});

const statusConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Inspect project (default) or user-level configuration"),
  ),
} as const;

const syncConfig = {
  scope: scopeFlag.pipe(Flag.withDescription("Sync project (default) or user-level configuration")),
  force: Flag.boolean("force").pipe(Flag.withDescription("Overwrite drifted copy-mode files")),
  dryRun: Flag.boolean("dry-run").pipe(
    Flag.withDescription("Preview changes without writing files"),
  ),
} as const;

const doctorConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Check project (default) or user-level configuration"),
  ),
  fix: Flag.boolean("fix").pipe(Flag.withDescription("Apply safe instruction-file repairs")),
} as const;

const enableConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Enable project (default) or user-level configuration"),
  ),
  fileName: Flag.string("file").pipe(
    Flag.withDescription("Source-of-truth instruction file"),
    Flag.withDefault("AGENTS.md"),
  ),
  gitignore: Flag.choice("gitignore", gitignoreModes).pipe(
    Flag.withDescription("Manage propagated files in .gitignore, .git/info/exclude, or neither"),
    Flag.withDefault("off"),
  ),
} as const;

const disableConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Disable project (default) or user-level configuration"),
  ),
} as const;

export const instructionsStatusCommand = Command.make("status", statusConfig, ({ scope }) =>
  handleInstructionsStatus().pipe(withWorkspace(scope), withRuntime("agents instructions status")),
).pipe(
  withArgvTracking(statusConfig),
  Command.withDescription("Inspect configured agent instruction files"),
  Command.withExamples([
    { command: "axm agents instructions status", description: "Inspect instruction files" },
  ]),
);

export const instructionsSyncCommand = Command.make(
  "sync",
  syncConfig,
  ({ scope, force, dryRun }) =>
    handleInstructionsSync({ force, dryRun }).pipe(
      withWorkspace(scope),
      withRuntime("agents instructions sync"),
    ),
).pipe(
  withArgvTracking(syncConfig),
  Command.withDescription("Propagate the source instruction file to configured agents"),
  Command.withExamples([
    { command: "axm agents instructions sync", description: "Update instruction files" },
    {
      command: "axm agents instructions sync --dry-run",
      description: "Preview instruction file updates",
    },
  ]),
);

export const instructionsDoctorCommand = Command.make("doctor", doctorConfig, ({ scope, fix }) =>
  handleInstructionsDoctor({ fix }).pipe(
    withWorkspace(scope),
    withRuntime("agents instructions doctor"),
  ),
).pipe(
  withArgvTracking(doctorConfig),
  Command.withDescription("Diagnose instruction-file propagation"),
  Command.withExamples([
    { command: "axm agents instructions doctor", description: "Check instruction files" },
    {
      command: "axm agents instructions doctor --fix",
      description: "Apply safe instruction-file repairs",
    },
  ]),
);

export const instructionsEnableCommand = Command.make(
  "enable",
  enableConfig,
  ({ scope, fileName, gitignore }) =>
    handleInstructionsEnable({ fileName, gitignore }).pipe(
      withWorkspace(scope),
      withRuntime("agents instructions enable"),
    ),
).pipe(
  withArgvTracking(enableConfig),
  Command.withDescription("Enable instruction-file management"),
  Command.withExamples([
    { command: "axm agents instructions enable", description: "Enable instruction files" },
    {
      command: "axm agents instructions enable --gitignore managed",
      description: "Enable managed gitignore entries",
    },
  ]),
);

export const instructionsDisableCommand = Command.make("disable", disableConfig, ({ scope }) =>
  handleInstructionsDisable().pipe(
    withWorkspace(scope),
    withRuntime("agents instructions disable"),
  ),
).pipe(
  withArgvTracking(disableConfig),
  Command.withDescription("Disable instruction-file management"),
  Command.withExamples([
    { command: "axm agents instructions disable", description: "Disable instruction files" },
  ]),
);

export const instructionsAdoptCommand = Command.make("adopt", statusConfig, ({ scope }) =>
  Effect.fail(
    makeAppError({
      code: "usage",
      detail: "`axm agents instructions adopt` is not implemented yet.",
      suggestions: [
        { description: "Enable management explicitly.", cmd: "axm agents instructions enable" },
      ],
    }),
  ).pipe(withWorkspace(scope), withRuntime("agents instructions adopt")),
).pipe(
  withArgvTracking(statusConfig),
  Command.withDescription("Adopt existing instruction files into one source of truth"),
  Command.withExamples([
    { command: "axm agents instructions adopt", description: "Adopt existing instruction files" },
  ]),
);

export const instructionsCommand = Command.make("instructions", statusConfig, ({ scope }) =>
  handleInstructionsStatus().pipe(withWorkspace(scope), withRuntime("agents instructions")),
).pipe(
  withArgvTracking(statusConfig),
  Command.withDescription("Manage configured agent instruction files"),
  Command.withExamples([
    { command: "axm agents instructions", description: "Inspect instruction files" },
    {
      command: "axm agents instructions sync --dry-run",
      description: "Preview instruction file updates",
    },
  ]),
  Command.withSubcommands([
    instructionsStatusCommand,
    instructionsSyncCommand,
    instructionsDoctorCommand,
    instructionsAdoptCommand,
    instructionsEnableCommand,
    instructionsDisableCommand,
  ]),
);

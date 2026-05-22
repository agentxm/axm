import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  getInstructionsStatus,
  resolveInstructionsConfig,
} from "@agentxm/client-core/unstable/agents";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  CliRenderer,
  registerEntity,
  type TableView,
} from "@agentxm/client-core/unstable/cli-renderer";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

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
  gitignore: Schema.Boolean,
  roots: Schema.Array(Schema.String),
  items: Schema.Array(InstructionStatusItemSchema),
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
      gitignore: false,
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

export const handleInstructionsEnable = Effect.fn("Agents.instructions.enable")(function* (args: {
  readonly fileName: string;
  readonly gitignore: boolean;
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

const enableConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Enable project (default) or user-level configuration"),
  ),
  fileName: Flag.string("file").pipe(
    Flag.withDescription("Source-of-truth instruction file"),
    Flag.withDefault("AGENTS.md"),
  ),
  gitignore: Flag.boolean("gitignore").pipe(
    Flag.withDescription("Manage propagated files in .gitignore"),
    Flag.withDefault(true),
  ),
} as const;

const disableConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Disable project (default) or user-level configuration"),
  ),
} as const;

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
      command: "axm agents instructions enable --no-gitignore",
      description: "Enable without writing gitignore entries",
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

export const instructionsCommand = Command.make("instructions", statusConfig, ({ scope }) =>
  handleInstructionsStatus().pipe(withWorkspace(scope), withRuntime("agents instructions")),
).pipe(
  withArgvTracking(statusConfig),
  Command.withDescription("Manage configured agent instruction files"),
  Command.withExamples([
    { command: "axm agents instructions", description: "Inspect instruction files" },
    {
      command: "axm lint --fix",
      description: "Repair instruction-file drift",
    },
  ]),
  Command.withSubcommands([instructionsEnableCommand, instructionsDisableCommand]),
);

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

registerEntity<InstructionTableItem>("agent-rule", {
  list: {
    columns: InstructionsTable.columns,
    emptyMessage: "No instruction files configured",
  },
});

const currentInstructionsConfig = Effect.fn("Rules.instructions.currentConfig")(function* () {
  const ws = yield* WorkspaceMutations;
  const config = yield* ws.getInstructionsConfig();
  if (Option.isNone(config) || config.value === false) return Option.none();
  return Option.some(resolveInstructionsConfig(config.value));
});

export const handleRulesStatus = Effect.fn("Rules.status")(function* () {
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
  yield* renderer.table(tableItems, InstructionsTable, "Agent rules");
});

export const handleRulesEnable = Effect.fn("Rules.enable")(function* (args: {
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

export const handleRulesDisable = Effect.fn("Rules.disable")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  yield* ws.setInstructionsConfig(false);
  yield* renderer.success("Instruction-file management disabled.");
});

export const rulesStatusConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Inspect project (default) or user-level configuration"),
  ),
} as const;

export const rulesEnableConfig = {
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

export const rulesDisableConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Disable project (default) or user-level configuration"),
  ),
} as const;

export const rulesEnableCommand = Command.make(
  "enable",
  rulesEnableConfig,
  ({ scope, fileName, gitignore }) =>
    handleRulesEnable({ fileName, gitignore }).pipe(
      withWorkspace(scope),
      withRuntime("rules enable"),
    ),
).pipe(
  withArgvTracking(rulesEnableConfig),
  Command.withDescription("Enable instruction-file management"),
  Command.withExamples([
    { command: "axm rules enable", description: "Enable instruction files" },
    {
      command: "axm rules enable --no-gitignore",
      description: "Enable without writing gitignore entries",
    },
  ]),
);

export const rulesDisableCommand = Command.make("disable", rulesDisableConfig, ({ scope }) =>
  handleRulesDisable().pipe(withWorkspace(scope), withRuntime("rules disable")),
).pipe(
  withArgvTracking(rulesDisableConfig),
  Command.withDescription("Disable instruction-file management"),
  Command.withExamples([
    { command: "axm rules disable", description: "Disable instruction files" },
  ]),
);

export const rulesCommand = Command.make("rules", rulesStatusConfig, ({ scope }) =>
  handleRulesStatus().pipe(withWorkspace(scope), withRuntime("rules")),
).pipe(
  withArgvTracking(rulesStatusConfig),
  Command.withDescription("Manage rules capabilities for configured agents"),
  Command.withExamples([
    { command: "axm rules", description: "Inspect instruction files" },
    {
      command: "axm lint --fix",
      description: "Repair instruction-file drift",
    },
  ]),
  Command.withSubcommands([rulesEnableCommand, rulesDisableCommand]),
);

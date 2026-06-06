import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type {
  InstructionsConfig,
  InstructionsConfigValue,
} from "@agentxm/client-core/unstable/settings";
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
import type { JobStepResult, Plan } from "@agentxm/client-core/unstable/plan";
import {
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "@agentxm/client-core/unstable/workspace";
import { emitPlanResolutionResult } from "../../json-output.js";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";

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
  gitignoreAliases: Schema.Boolean,
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
    singularLabel: "instruction file",
    pluralLabel: "instruction files",
  },
});

const currentInstructionsConfig = Effect.fn("Rules.instructions.currentConfig")(function* () {
  const ws = yield* WorkspaceMutations;
  const config = yield* ws.getInstructionsConfig();
  if (Option.isNone(config) || config.value === false) return Option.none();
  return Option.some(resolveInstructionsConfig(config.value));
});

const rawInstructionsConfigEquals = (
  value: InstructionsConfigValue,
  expected: InstructionsConfig,
): boolean => {
  if (value === false) return false;
  const resolved = resolveInstructionsConfig(value);
  return (
    resolved.fileName === expected.fileName &&
    resolved.gitignoreAliases === expected.gitignoreAliases
  );
};

const makeInstructionsConfigPlan = (args: {
  readonly name: string;
  readonly description: string;
  readonly stepLabel: string;
  readonly stepMessage: string;
  readonly config: InstructionsConfigValue;
  readonly ws: WorkspaceMutationsService;
}): Plan => ({
  _tag: "Plan",
  name: args.name,
  description: Option.some(args.description),
  jobs: [
    {
      concurrency: 1,
      steps: [
        {
          label: args.stepLabel,
          readiness: "ready",
          run: args.ws.setInstructionsConfig(args.config).pipe(
            Effect.as({
              result: "success",
              message: args.stepMessage,
              artifact: {
                path: ".axm/settings.json",
                scope: args.ws.scope,
                change: "updated",
              },
            } satisfies JobStepResult),
          ),
        },
      ],
    },
  ],
});

export const handleRulesStatus = Effect.fn("Rules.status")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const config = yield* currentInstructionsConfig();

  if (Option.isNone(config)) {
    const output = {
      enabled: false,
      sourceFileName: "AGENTS.md",
      gitignoreAliases: false,
      roots: [],
      items: [],
    };
    if (yield* renderer.result(output, InstructionsStatusOutputSchema)) return;
    yield* renderer.list("agent-rule", {
      items: [],
      count: 0,
      emptyMessage: "Instruction-file management is disabled.",
    });
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
    yield* renderer.list("agent-rule", {
      items: [],
      count: 0,
      emptyMessage: "No configured agents need instruction-file propagation.",
    });
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
  yield* renderer.list("agent-rule", {
    items: tableItems,
    count: tableItems.length,
  });
});

export const handleRulesEnable = Effect.fn("Rules.enable")(function* (args: {
  readonly fileName: string;
  readonly gitignore: boolean;
}) {
  const ws = yield* WorkspaceMutations;
  const config = {
    fileName: args.fileName,
    gitignoreAliases: args.gitignore,
  } satisfies InstructionsConfig;
  const current = yield* ws.getInstructionsConfig();

  if (Option.isSome(current) && rawInstructionsConfigEquals(current.value, config)) {
    yield* emitNoOpOutcome("rules.enable", {
      planName: "Enable instruction-file management",
      message: "Instruction-file management is already enabled.",
      withoutSuggestions: true,
    });
    return;
  }

  const resolution = yield* previewOrApplyLocalPlan(
    makeInstructionsConfigPlan({
      name: "Enable instruction-file management",
      description: `Use ${config.fileName} as the source instruction file`,
      stepLabel: "Enable instruction-file management",
      stepMessage: "Enabled instruction-file management",
      config,
      ws,
    }),
    { preview: false },
  );
  yield* emitPlanResolutionResult("rules.enable", resolution);
});

export const handleRulesDisable = Effect.fn("Rules.disable")(function* () {
  const ws = yield* WorkspaceMutations;
  const current = yield* ws.getInstructionsConfig();

  if (Option.isNone(current) || current.value === false) {
    yield* emitNoOpOutcome("rules.disable", {
      planName: "Disable instruction-file management",
      message: "Instruction-file management is already disabled.",
      withoutSuggestions: true,
    });
    return;
  }

  const resolution = yield* previewOrApplyLocalPlan(
    makeInstructionsConfigPlan({
      name: "Disable instruction-file management",
      description: "Turn off instruction-file propagation",
      stepLabel: "Disable instruction-file management",
      stepMessage: "Disabled instruction-file management",
      config: false,
      ws,
    }),
    { preview: false },
  );
  yield* emitPlanResolutionResult("rules.disable", resolution);
});

const rulesStatusConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Inspect project (default) or user-level configuration"),
  ),
} as const;

const rulesEnableConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Enable project (default) or user-level configuration"),
  ),
  fileName: Flag.string("file").pipe(
    Flag.withDescription("Source-of-truth instruction file"),
    Flag.withDefault("AGENTS.md"),
  ),
  gitignore: Flag.boolean("gitignore").pipe(
    Flag.withDescription("Manage propagated alias files in .gitignore"),
    Flag.withDefault(true),
  ),
} as const;

const rulesDisableConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Disable project (default) or user-level configuration"),
  ),
} as const;

const rulesEnableCommand = Command.make(
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
      description: "Enable without writing alias gitignore entries",
    },
  ]),
);

const rulesDisableCommand = Command.make("disable", rulesDisableConfig, ({ scope }) =>
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

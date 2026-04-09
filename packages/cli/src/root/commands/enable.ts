import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { CodingAgentRepository } from "@axm.sh/core/unstable/agents";
import { decodeExtensionNameSync, type ExtensionName } from "@axm.sh/core/unstable/extensions";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import type { EnableCommandOperation } from "@axm.sh/core/unstable/commands";
import { enableCommand as runEnableCommand } from "@axm.sh/core/unstable/commands";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import type { Plan, PlannedJobStep } from "@axm.sh/core/unstable/workspace";
import { previewOrApplyPlan } from "@axm.sh/core/unstable/workspace";
import { emitNoOpResult, emitPlanResolutionResult } from "../../json-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { scopeFlag } from "../../cli-flags.js";
import { toJobStepResult } from "./job-step-result.js";

export interface EnableCommandHandlerArgs {
  readonly name: ExtensionName;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export const handleEnableCommand = Effect.fn("EnableCommand.handle")(function* (
  args: EnableCommandHandlerArgs,
) {
  const ws = yield* Workspace;
  const renderer = yield* CliRenderer;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const agentRepo = yield* CodingAgentRepository;

  yield* renderer.info("axm commands enable");

  // Load installed commands (configured + implicit) -- taxonomy lifecycle view
  const installedCommands = yield* ws.getInstalledCommands();
  const entry = installedCommands[args.name];

  // Validate: command is installed (ignored names are excluded from installed)
  if (entry === undefined) {
    return yield* makeAppError({
      code: "COMMAND_NOT_FOUND",
      what: `Command '${args.name}' is not installed`,
      howToFix: "Run `axm commands list` to see available commands",
    });
  }

  // Validate: command is currently disabled
  if (entry.enabled) {
    if (
      yield* emitNoOpResult("commands.enable", {
        planName: "Enable command",
        planDescription: `Enable ${args.name}`,
        message: `Command '${args.name}' is already enabled`,
      })
    ) {
      return;
    }

    yield* renderer.info(`Command '${args.name}' is already enabled`);
    yield* renderer.success("Nothing to do.");
    return;
  }

  // Display preview info
  if (args.preview) {
    const lockedEntry = yield* ws.getLockedCommand(args.name);
    if (Option.isSome(lockedEntry) && lockedEntry.value.agents) {
      yield* renderer.info(
        `Would re-render to agents:\n${lockedEntry.value.agents.map((a: string) => `  - ${a}`).join("\n") || "  (no agents recorded)"}`,
      );
    } else {
      const configuredAgentIds = yield* ws.getConfiguredAgents();
      yield* renderer.info(
        `Would render to configured agents:\n${configuredAgentIds.map((a: string) => `  - ${a}`).join("\n")}`,
      );
    }
  }

  // Build operation
  const op = {
    name: "enable-command",
    args: { commandName: args.name },
  } satisfies EnableCommandOperation;

  // Build plan with inline run closure
  const step: PlannedJobStep = {
    readiness: "ready",
    label: args.name,
    run: runEnableCommand(op).pipe(
      Effect.map(toJobStepResult),
      Effect.provideService(Workspace, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.provideService(CodingAgentRepository, agentRepo),
    ),
  };

  const plan: Plan = {
    _tag: "Plan",
    name: "Enable command",
    description: Option.some(`Enable ${args.name}`),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("commands.enable", resolution);

  if (resolution._tag === "ExecutedPlan") {
    yield* renderer.success("Done");
  }
});

const enableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the command to enable")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Enable in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Enable without confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription("Enable even if the command has unresolved dependencies"),
  ),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without enabling")),
} as const;

export const enableCommand = Command.make(
  "enable",
  enableConfig,
  ({ name, scope, yes, force, preview }) =>
    handleEnableCommand({ name: decodeExtensionNameSync(name), yes, force, preview }).pipe(
      withWorkspace(scope),
      withRuntime("commands enable"),
    ),
).pipe(
  withArgvTracking(enableConfig),
  Command.withDescription("Enable a previously disabled command"),
  Command.withExamples([
    {
      command: "axm commands enable my-cmd",
      description: "Re-enable a command you previously disabled",
    },
    {
      command: "axm commands enable my-cmd --preview",
      description: "Preview the change before enabling",
    },
  ]),
);

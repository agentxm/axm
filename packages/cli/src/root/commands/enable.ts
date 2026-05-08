import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { resolveInstalledIdentifierNameOrInput } from "@agentxm/client-core/unstable/source-resolution";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { EnableCommandOperation } from "@agentxm/client-core/unstable/commands";
import { enableCommand as runEnableCommand } from "@agentxm/client-core/unstable/commands";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import type { Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { emitNoOpResult, emitPlanResolutionResult } from "../../json-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { scopeFlag } from "../../cli-flags.js";
import { toJobStepResult } from "./job-step-result.js";
import { combinePlanSections, makeAgentSection } from "./preview-sections.js";

export interface EnableCommandHandlerArgs {
  readonly name: string;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export const handleEnableCommand = Effect.fn("EnableCommand.handle")(function* (
  args: EnableCommandHandlerArgs,
) {
  const ws = yield* WorkspaceMutations;
  const renderer = yield* CliRenderer;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const agentRepo = yield* CodingAgentRepository;

  yield* renderer.info("axm commands enable");

  const commandName = yield* resolveInstalledIdentifierNameOrInput({
    input: args.name,
    resourceType: "command",
  });

  // Load installed commands (configured + implicit) from the read-model record projection.
  const installedCommands = yield* ws.records.getInstalledCommands();
  const entry = installedCommands[commandName];

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
        planDescription: `Enable ${commandName}`,
        message: `Command '${commandName}' is already enabled`,
      })
    ) {
      return;
    }

    yield* renderer.info(`Command '${commandName}' is already enabled`);
    yield* renderer.success("Nothing to do.");
    return;
  }

  const lockedEntry = yield* ws.getLockedCommand(commandName);
  const configuredAgentIds = Option.isSome(lockedEntry) ? [] : yield* ws.getConfiguredAgents();
  const planSections = Option.isSome(lockedEntry)
    ? combinePlanSections(
        makeAgentSection(
          "Would re-render to agents",
          lockedEntry.value.agents,
          "(no agents recorded)",
        ),
      )
    : combinePlanSections(
        makeAgentSection(
          "Would render to configured agents",
          configuredAgentIds,
          "(no agents configured)",
        ),
      );

  // Build operation
  const op = {
    name: "enable-command",
    args: { commandName },
  } satisfies EnableCommandOperation;

  // Build plan with inline run closure
  const step: PlannedJobStep = {
    readiness: "ready",
    label: commandName,
    run: runEnableCommand(op).pipe(
      Effect.map(toJobStepResult),
      Effect.provideService(WorkspaceMutations, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.provideService(CodingAgentRepository, agentRepo),
    ),
  };

  const plan: Plan = {
    _tag: "Plan",
    name: "Enable command",
    description: Option.some(`Enable ${commandName}`),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
    ...(planSections === undefined ? {} : { sections: planSections }),
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
    handleEnableCommand({ name, yes, force, preview }).pipe(
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

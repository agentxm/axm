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
import type { DisableCommandOperation } from "@agentxm/client-core/unstable/commands";
import { disableCommand as runDisableCommand } from "@agentxm/client-core/unstable/commands";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import type { Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { emitNoOpResult, emitPlanResolutionResult } from "../../json-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { scopeFlag } from "../../cli-flags.js";
import { toJobStepResult } from "./job-step-result.js";
import {
  combinePlanSections,
  makeAgentSection,
  makeRenderedFilesSection,
} from "./preview-sections.js";

export interface DisableCommandHandlerArgs {
  readonly name: string;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export const handleDisableCommand = Effect.fn("DisableCommand.handle")(function* (
  args: DisableCommandHandlerArgs,
) {
  const ws = yield* WorkspaceMutations;
  const renderer = yield* CliRenderer;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const agentRepo = yield* CodingAgentRepository;

  yield* renderer.info("axm commands disable");

  const commandName = yield* resolveInstalledIdentifierNameOrInput({
    input: args.name,
    resourceType: "command",
  });

  // Load installed commands (configured + implicit) from the read-model record projection.
  const installedCommands = yield* ws.records.getInstalledCommands();
  const installedEntry = installedCommands[commandName];

  // Validate: command is installed (ignored names are excluded from installed)
  if (installedEntry === undefined) {
    return yield* makeAppError({
      code: "not_found",
      message: `Command '${args.name}' is not installed`,
      breadcrumbs: [
        { task: "Recover", description: "Run `axm commands list` to see available commands" },
      ],
    });
  }

  // Configured command -- check if already disabled (implicit commands are always enabled)
  if (installedEntry.lifecycle === "configured" && !installedEntry.enabled) {
    if (
      yield* emitNoOpResult("commands.disable", {
        planName: "Disable command",
        planDescription: `Disable ${commandName}`,
        message: `Command '${commandName}' is already disabled`,
      })
    ) {
      return;
    }

    yield* renderer.info(`Command '${commandName}' is already disabled`);
    yield* renderer.success("Nothing to do.");
    return;
  }

  const lockedEntry = yield* ws.getLockedCommand(commandName);
  const planSections = Option.isSome(lockedEntry)
    ? combinePlanSections(
        makeAgentSection(
          "Would remove rendered files from agents",
          lockedEntry.value.agents,
          "(no agents recorded)",
        ),
        makeRenderedFilesSection(
          "Files that would be removed",
          lockedEntry.value.renderedFiles ?? {},
        ),
      )
    : undefined;

  // Build operation
  const op = {
    name: "disable-command",
    args: { commandName },
  } satisfies DisableCommandOperation;

  // Build plan with inline run closure
  const step: PlannedJobStep = {
    readiness: "ready",
    label: commandName,
    run: runDisableCommand(op).pipe(
      Effect.map(toJobStepResult),
      Effect.provideService(WorkspaceMutations, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.provideService(CodingAgentRepository, agentRepo),
    ),
  };

  const plan: Plan = {
    _tag: "Plan",
    name: "Disable command",
    description: Option.some(`Disable ${commandName}`),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
    ...(planSections === undefined ? {} : { sections: planSections }),
  };

  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("commands.disable", resolution);

  if (resolution._tag === "ExecutedPlan") {
    yield* renderer.success("Done");
  }
});

const disableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the command to disable")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Disable in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Disable without confirmation")),
  force: forceFlag.pipe(Flag.withDescription("Disable even if other commands depend on it")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without disabling")),
} as const;

export const disableCommand = Command.make(
  "disable",
  disableConfig,
  ({ name, scope, yes, force, preview }) =>
    handleDisableCommand({ name, yes, force, preview }).pipe(
      withWorkspace(scope),
      withRuntime("commands disable"),
    ),
).pipe(
  withArgvTracking(disableConfig),
  Command.withDescription("Disable a command without uninstalling it"),
  Command.withExamples([
    {
      command: "axm commands disable my-cmd",
      description: "Temporarily disable a command without removing it",
    },
    {
      command: "axm commands disable my-cmd --scope user",
      description: "Disable for user-scope configuration",
    },
  ]),
);

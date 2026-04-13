import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Array from "effect/Array";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { Workspace } from "@agentxm/client-core/unstable/workspace";
import { installCommand as installCommandOp } from "@agentxm/client-core/unstable/commands";
import {
  resolveSource,
  SourceHostProviders,
} from "@agentxm/client-core/unstable/source-resolution";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import type { Plan, PlannedJobStep } from "@agentxm/client-core/unstable/workspace";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/workspace";
import { emitNoOpResult, emitPlanResolutionResult } from "../../json-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { scopeFlag } from "../../cli-flags.js";
import type { CommandExtensionRef } from "@agentxm/client-core/unstable/commands";
import { toJobStepResult } from "./job-step-result.js";
import { combinePlanSections, makeItemSection } from "./preview-sections.js";

export interface UpdateCommandHandlerArgs {
  readonly name: Option.Option<string>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export const handleUpdateCommand = Effect.fn("UpdateCommand.handle")(function* (
  args: UpdateCommandHandlerArgs,
) {
  const ws = yield* Workspace;
  const renderer = yield* CliRenderer;

  yield* renderer.info(`axm commands update (${ws.scope})`);

  // Step 1: Load configured commands and filter to enabled
  const allCommands = yield* ws.getConfiguredCommands();

  const commandEntries = yield* Effect.forEach(Object.entries(allCommands), ([name, entry]) =>
    Effect.gen(function* () {
      if (!entry.enabled) {
        yield* renderer.info(`Skipping ${name} (disabled)`);
        return Option.none<readonly [string, string]>();
      }
      return Option.some([name, entry.source] as const);
    }),
  ).pipe(Effect.map(Array.getSomes));

  if (commandEntries.length === 0) {
    if (
      yield* emitNoOpResult("commands.update", {
        planName: "Update command(s)",
        planDescription: "Update installed commands",
        message: "No commands installed. Nothing to update.",
      })
    ) {
      return;
    }

    yield* renderer.info("No commands installed. Nothing to update.");
    return;
  }

  // Step 2: Filter by name if provided
  const nameValue = Option.getOrUndefined(args.name);
  const filteredEntries =
    nameValue !== undefined
      ? commandEntries.filter(([name]) => name === nameValue)
      : commandEntries;

  if (nameValue !== undefined && filteredEntries.length === 0) {
    if (
      yield* emitNoOpResult("commands.update", {
        planName: "Update command(s)",
        planDescription: "Update installed commands",
        message: `Command "${nameValue}" is not installed or is disabled. Nothing to update.`,
      })
    ) {
      return;
    }

    yield* renderer.warn(
      `Command "${nameValue}" is not installed or is disabled. Nothing to update.`,
    );
    return;
  }

  // Step 3: Re-resolve each source and discover commands
  const sources = yield* SourceHostProviders;
  const agentRepo = yield* CodingAgentRepository;
  const resolved = yield* renderer.withSpinner(
    "Resolving sources...",
    () =>
      Effect.forEach(
        filteredEntries,
        ([name, sourceStr]) =>
          Effect.gen(function* () {
            const source = yield* resolveSource(sourceStr);
            const refs = yield* sources
              .find(source, {
                names: [name],
                type: "command",
                owner: Option.none(),
                versionConstraint: Option.none(),
              })
              .pipe(
                Effect.map((refs) =>
                  refs.filter((ref): ref is CommandExtensionRef => ref.type === "command"),
                ),
              );

            const commandRef = refs.find((r) => r.command.name === name);
            if (commandRef) {
              return Option.some({ name, ref: commandRef });
            }

            yield* renderer.warn(`Command "${name}" not found in source ${sources.origin(source)}`);
            return Option.none<{ readonly name: string; readonly ref: CommandExtensionRef }>();
          }).pipe(
            Effect.catchTag("AppError", (error) =>
              renderer.warn(`Failed to resolve "${name}": ${String(error)}`).pipe(
                Effect.map(() =>
                  Option.none<{
                    readonly name: string;
                    readonly ref: CommandExtensionRef;
                  }>(),
                ),
              ),
            ),
          ),
        { concurrency: "unbounded" },
      ),
    { successMessage: "Sources resolved" },
  );

  const resolvedEntries = Array.getSomes(resolved);
  if (resolvedEntries.length === 0) {
    return yield* makeAppError({
      code: "UPDATE_FAILED",
      what: "All source re-resolutions failed. Nothing to update.",
      howToFix: "Verify the original source paths are still accessible.",
    });
  }

  // Step 4: Build operations
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const steps: ReadonlyArray<PlannedJobStep> = resolvedEntries.map((entry) => ({
    readiness: "ready" as const,
    label: entry.name,
    run: installCommandOp({
      name: "install-command",
      args: {
        ref: entry.ref,
        force: args.force,
        versionConstraint: Option.none(),
        skipSettings: Option.none(),
      },
    }).pipe(
      Effect.map(toJobStepResult),
      Effect.provideService(Workspace, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.provideService(CliRenderer, renderer),
      Effect.provideService(SourceHostProviders, sources),
      Effect.provideService(CodingAgentRepository, agentRepo),
    ),
  }));
  const planSections = combinePlanSections(
    makeItemSection(
      `Would update ${resolvedEntries.length} command(s)`,
      resolvedEntries.map((entry) => entry.name),
    ),
  );

  const plan: Plan = {
    _tag: "Plan",
    name: "Update command(s)",
    description: Option.some("Update installed commands"),
    jobs: [{ concurrency: 1 as const, steps: [...steps] }],
    ...(planSections === undefined ? {} : { sections: planSections }),
  };

  // Step 5: Resolve plan
  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("commands.update", resolution);

  if (resolution._tag === "ExecutedPlan") {
    yield* renderer.success("Done");
  }
});

const updateConfig = {
  name: Argument.string("name").pipe(
    Argument.withDescription("Name of the command to update (updates all if omitted)"),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Update commands in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Apply all updates without confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription("Update even if version constraints would prevent it"),
  ),
  preview: previewFlag.pipe(Flag.withDescription("Show available updates without applying them")),
} as const;

export const updateCommand = Command.make(
  "update",
  updateConfig,
  ({ name, scope, yes, force, preview }) =>
    handleUpdateCommand({ name, yes, force, preview }).pipe(
      withWorkspace(scope),
      withRuntime("commands update"),
    ),
).pipe(
  withArgvTracking(updateConfig),
  Command.withDescription("Update installed commands to latest versions"),
  Command.withExamples([
    {
      command: "axm commands update",
      description: "Update all commands to their latest versions",
    },
    {
      command: "axm commands update my-cmd",
      description: "Update a specific command",
    },
    {
      command: "axm commands update --preview",
      description: "Preview available updates",
    },
  ]),
);

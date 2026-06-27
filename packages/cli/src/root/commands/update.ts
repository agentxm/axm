import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import { CliRenderer, count } from "@agentxm/client-core/unstable/cli-renderer";
import {
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "@agentxm/client-core/unstable/workspace";
import { installCommand as installCommandOp } from "@agentxm/client-core/unstable/commands";
import {
  resolveSource,
  SourceHostProviders,
} from "@agentxm/client-core/unstable/source-resolution";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import type { JobStepResult, Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { emitPlanResolutionResult } from "../../json-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { scopeFlag } from "../../cli-flags.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import {
  allUpdateTargetResolutionsFailed,
  resolveUpdateTargets,
} from "../shared/update-targets.js";
import type { CommandExtensionRef } from "@agentxm/client-core/unstable/commands";
import { toJobStepResult } from "./job-step-result.js";
import { combinePlanSections, makeItemSection } from "./preview-sections.js";

export interface UpdateCommandHandlerArgs {
  readonly name: Option.Option<string>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

type ResolveOutcome =
  | { readonly type: "match"; readonly name: string; readonly ref: CommandExtensionRef }
  | {
      readonly type: "skip";
      readonly name: string;
      readonly source: string;
      readonly reason: string;
    };

const skippedCommandStep = (
  ws: WorkspaceMutationsService,
  outcome: Extract<ResolveOutcome, { readonly type: "skip" }>,
): PlannedJobStep => ({
  readiness: "ready",
  label: `Skip ${outcome.name}`,
  run: Effect.succeed({
    result: "success",
    message: outcome.reason,
    artifact: {
      path: outcome.source,
      scope: ws.scope,
      change: "unchanged",
      targets: [{ path: outcome.source, change: "unchanged" }],
    },
  } satisfies JobStepResult),
});

const toUpdateStepResult =
  (commandName: string) =>
  (result: Parameters<typeof toJobStepResult>[0]): JobStepResult => {
    const stepResult = toJobStepResult(result);
    if (stepResult.result === "error") return stepResult;

    switch (stepResult.artifact?.change) {
      case "updated":
        return { ...stepResult, message: `Updated ${commandName}` };
      case "unchanged":
        return { ...stepResult, message: `${commandName} already up to date` };
      default:
        return stepResult;
    }
  };

export const handleUpdateCommand = Effect.fn("UpdateCommand.handle")(function* (
  args: UpdateCommandHandlerArgs,
) {
  const ws = yield* WorkspaceMutations;
  const renderer = yield* CliRenderer;

  // Step 1: Load configured commands and filter to enabled
  const allCommands = yield* ws.records.getConfiguredCommands();

  const commandEntries: ReadonlyArray<readonly [string, string]> = Object.entries(
    allCommands,
  ).flatMap(([name, entry]) => (entry.enabled ? [[name, entry.source]] : []));

  if (commandEntries.length === 0) {
    yield* emitNoOpOutcome("commands.update", {
      planName: "Update commands",
      planDescription: "Update installed commands",
      message: "No commands installed.",
    });
    return;
  }

  const rawNameValue = Option.getOrUndefined(args.name);
  const targetResolution = yield* resolveUpdateTargets({
    command: "commands.update",
    planName: "Update commands",
    planDescription: "Update installed commands",
    entries: commandEntries,
    source: Option.none(),
    nameFilters: rawNameValue === undefined ? [] : [rawNameValue],
    nameFilterFlag: "name",
    resourceType: "command",
    resourceLabel: "command",
    resourceLabelPlural: "commands",
  });
  if (targetResolution.type === "no-op") {
    return;
  }
  const filteredEntries = targetResolution.entries;

  // Step 3: Re-resolve each source and discover commands
  const sources = yield* SourceHostProviders;
  const agentRepo = yield* CodingAgentRepository;
  const resolved = yield* Effect.forEach(
    filteredEntries,
    ([name, sourceStr]) =>
      Effect.gen(function* () {
        const source = yield* resolveSource(sourceStr);
        const refs = yield* sources
          .find(source, {
            names: [name],
            type: "command",
            owner: Option.none(),
            versionRange: Option.none(),
          })
          .pipe(
            Effect.map((refs) =>
              refs.filter((ref): ref is CommandExtensionRef => ref.type === "command"),
            ),
          );

        const commandRef = refs.find((r) => r.command.name === name);
        if (commandRef) {
          return {
            type: "match",
            name,
            ref: commandRef,
          } satisfies ResolveOutcome;
        }

        return {
          type: "skip",
          name,
          source: sourceStr,
          reason: `Command "${name}" not found in source ${sources.origin(source)}`,
        } satisfies ResolveOutcome;
      }).pipe(
        Effect.catchTag("AppError", (error) =>
          Effect.succeed({
            type: "skip",
            name,
            source: sourceStr,
            reason: `Failed to resolve "${name}": ${error.detail}`,
          } satisfies ResolveOutcome),
        ),
      ),
    { concurrency: "unbounded" },
  );

  const resolvedEntries = resolved.filter(
    (entry): entry is Extract<ResolveOutcome, { readonly type: "match" }> => entry.type === "match",
  );
  const skippedEntries = resolved.filter(
    (entry): entry is Extract<ResolveOutcome, { readonly type: "skip" }> => entry.type === "skip",
  );
  if (resolvedEntries.length === 0) {
    return yield* allUpdateTargetResolutionsFailed({
      resourceLabelPlural: "command",
      suggestions: [{ description: "Verify the original source paths are still accessible." }],
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
        versionRange: Option.none(),
        skipSettings: Option.none(),
      },
    }).pipe(
      Effect.map(toUpdateStepResult(entry.name)),
      Effect.provideService(WorkspaceMutations, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.provideService(CliRenderer, renderer),
      Effect.provideService(SourceHostProviders, sources),
      Effect.provideService(CodingAgentRepository, agentRepo),
    ),
  }));
  const skippedSteps = skippedEntries.map((entry) => skippedCommandStep(ws, entry));
  const planSections = combinePlanSections(
    makeItemSection(
      `Would update ${count(resolvedEntries.length, "command")}`,
      resolvedEntries.map((entry) => entry.name),
    ),
  );

  const plan: Plan = {
    _tag: "Plan",
    name: "Update commands",
    description: Option.some("Update installed commands"),
    jobs: [{ concurrency: 1 as const, steps: [...steps, ...skippedSteps] }],
    ...(planSections === undefined ? {} : { sections: planSections }),
  };

  // Step 5: Resolve plan
  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("commands.update", resolution);
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

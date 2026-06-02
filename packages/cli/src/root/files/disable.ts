import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { FilesManager } from "@agentxm/client-core/unstable/files";
import {
  previewOrApplyPlan,
  type JobStepResult,
  type Plan,
} from "@agentxm/client-core/unstable/plan";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { emitNoOpResult, emitPlanResolutionResult } from "../../json-output.js";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

export const handleDisableFiles = Effect.fn("DisableFiles.handle")(function* (args: {
  readonly name: string;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}) {
  const ws = yield* WorkspaceMutations;
  const renderer = yield* CliRenderer;
  const filesManager = yield* FilesManager;
  const configured = yield* ws.getConfiguredFilesEntries();
  const entry = configured[args.name];
  if (entry === undefined) {
    yield* renderer.warn(`files package "${args.name}" is not configured`);
    return;
  }
  if (!entry.enabled) {
    yield* emitNoOpResult("files.disable", {
      planName: "Disable files",
      message: `files package "${args.name}" is already disabled`,
    });
    return;
  }

  const plan: Plan = {
    _tag: "Plan",
    name: "Disable files",
    description: Option.some(`Disable files package ${args.name}`),
    jobs: [
      {
        concurrency: 1,
        steps: [
          {
            readiness: "ready",
            label: args.name,
            run: Effect.gen(function* () {
              yield* ws.updateFilesEntry(args.name, (current) => ({
                ...current,
                enabled: false,
              }));
              yield* filesManager.materializeUninstall({
                target: { type: "files", name: args.name },
              });
              return {
                result: "success",
                message: `Disabled ${args.name}`,
              } satisfies JobStepResult;
            }),
          },
        ],
      },
    ],
  };
  const resolution = yield* previewOrApplyPlan(plan, args);
  yield* emitPlanResolutionResult("files.disable", resolution);
});

const disableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the files package")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Disable in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Disable without confirmation")),
  force: forceFlag.pipe(Flag.withDescription("Disable even if retained dependencies exist")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without disabling")),
} as const;

export const disableCommand = Command.make(
  "disable",
  disableConfig,
  ({ name, scope, yes, force, preview }) =>
    handleDisableFiles({ name, yes, force, preview }).pipe(
      withWorkspace(scope),
      withRuntime("files disable"),
    ),
).pipe(
  withArgvTracking(disableConfig),
  Command.withDescription("Disable a files package without removing sync-once targets"),
  Command.withExamples([
    {
      command: "axm files disable workspace-baseline",
      description: "Disable a files package",
    },
  ]),
);

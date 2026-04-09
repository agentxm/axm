import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import {
  decodeExtensionNameSync,
  normalizeHandle,
  type ExtensionName,
} from "@axm.sh/core/unstable/extensions";
import type { NewCommandOperation } from "@axm.sh/core/unstable/commands";
import { newCommand as newCommandOp } from "@axm.sh/core/unstable/commands";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@axm.sh/core/unstable/workspace";
import type { Plan, PlannedJobStep } from "@axm.sh/core/unstable/workspace";
import { previewOrApplyPlan } from "@axm.sh/core/unstable/workspace";
import { emitPlanResolutionResult } from "../../json-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { toJobStepResult } from "./job-step-result.js";

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MAX_NAME_LENGTH = 64;

export interface CommandsNewHandlerArgs {
  readonly name: ExtensionName;
  readonly description: string;
  readonly profile: Option.Option<string>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

const normalizeOwner = (s: string) => normalizeHandle(s.startsWith("@") ? s : `@${s}`);

export const handleCommandsNew = Effect.fn("CommandsNew.handle")(function* (
  args: CommandsNewHandlerArgs,
) {
  const ws = yield* Workspace;
  const renderer = yield* CliRenderer;

  yield* renderer.info("axm commands new");

  // 1. Resolve profile
  const owner = Option.isSome(args.profile)
    ? normalizeOwner(args.profile.value)
    : yield* ws.getConfiguredProfile().pipe(
        Effect.flatMap((s) =>
          s === "@community"
            ? Effect.fail(
                makeAppError({
                  code: "NAMESPACE_REQUIRED",
                  what: "No profile configured for command creation",
                  howToFix:
                    "Configure a profile in settings.json with `axm init`, or use --profile",
                }),
              )
            : Effect.succeed(s),
        ),
      );

  // 2. Validate name
  if (
    args.name.length === 0 ||
    args.name.length > MAX_NAME_LENGTH ||
    !NAME_PATTERN.test(args.name)
  ) {
    return yield* makeAppError({
      code: "COMMAND_NAME_INVALID",
      what: `Invalid command name: "${args.name}"`,
      details: [
        "Command names must be lowercase, start with a letter or digit,",
        "contain only letters, digits, and hyphens, and not exceed 64 characters.",
      ],
      howToFix: "Choose a name matching /^[a-z0-9][a-z0-9-]*$/ (max 64 chars)",
    });
  }

  // 3. Check directory doesn't already exist
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const targetDir = path.resolve(args.name);
  const dirExists = yield* fs.exists(targetDir).pipe(Effect.orElseSucceed(() => false));

  if (dirExists) {
    return yield* makeAppError({
      code: "COMMAND_DIR_EXISTS",
      what: `Directory "${args.name}" already exists`,
      howToFix: "Choose a different name or remove the existing directory first",
    });
  }

  // 4. Build operation
  const op = {
    name: "new-command",
    args: { name: args.name, owner, description: args.description },
  } satisfies NewCommandOperation;

  // 5. Build plan with inline run closure
  const fqn = `${owner}/commands/${args.name}`;

  const step: PlannedJobStep = {
    readiness: "ready",
    label: fqn,
    run: newCommandOp(op).pipe(
      Effect.map(toJobStepResult),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    ),
  };

  const plan: Plan = {
    _tag: "Plan",
    name: "New command",
    description: Option.some(`Create ${fqn}`),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("commands.new", resolution);

  if (resolution._tag === "ExecutedPlan") {
    yield* renderer.success(`Created command ${fqn}`);
  }
});

const newConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the command")),
  description: Flag.string("description").pipe(
    Flag.withDescription("Description for the command"),
    Flag.withDefault(""),
  ),
  profile: Flag.string("profile").pipe(
    Flag.withDescription("Override the workspace profile (e.g., @acme)"),
    Flag.optional,
  ),
  yes: yesFlag.pipe(Flag.withDescription("Create the command without confirmation")),
  force: forceFlag.pipe(Flag.withDescription("Overwrite if a command directory already exists")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what files would be created without creating them"),
  ),
} as const;

export const newCommand = Command.make(
  "new",
  newConfig,
  ({ name, description, profile, yes, force, preview }) =>
    handleCommandsNew({
      name: decodeExtensionNameSync(name),
      description,
      profile,
      yes,
      force,
      preview,
    }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withRuntime("commands new")),
).pipe(
  withArgvTracking(newConfig),
  Command.withDescription("Create a new command"),
  Command.withExamples([
    { command: "axm commands new my-command", description: "Scaffold a new command" },
    {
      command: "axm commands new my-command --profile @acme",
      description: "Create under a specific owner",
    },
  ]),
);

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  decodeExtensionNameSync,
  normalizeHandle,
  REGISTRY_EXTENSIONS_DIR,
  type ExtensionName,
} from "@agentxm/client-core/unstable/extensions";
import type { NewCommandOperation } from "@agentxm/client-core/unstable/commands";
import { newCommand as newCommandOp } from "@agentxm/client-core/unstable/commands";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  DEFAULT_WORKSPACE_SCOPE,
  WorkspaceMutations,
} from "@agentxm/client-core/unstable/workspace";
import type { Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { emitPlanResolutionResult } from "../../json-output.js";
import { withAuthRuntime, withWorkspace } from "../../runtime.js";
import { resolveOwnerForNewContent } from "../shared/resolve-owner.js";
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
  const renderer = yield* CliRenderer;

  yield* renderer.info("axm commands new");

  // 1. Resolve owner
  const owner = Option.isSome(args.profile)
    ? normalizeOwner(args.profile.value)
    : yield* resolveOwnerForNewContent("command creation");

  // 2. Validate name
  if (
    args.name.length === 0 ||
    args.name.length > MAX_NAME_LENGTH ||
    !NAME_PATTERN.test(args.name)
  ) {
    return yield* makeAppError({
      code: "validation",
      message: `Invalid command name: "${args.name}"`,
      breadcrumbs: [
        {
          task: "Recover",
          description: "Choose a name matching /^[a-z0-9][a-z0-9-]*$/ (max 64 chars)",
        },
      ],
    });
  }

  // 3. Check the managed extension directory doesn't already exist
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const ws = yield* WorkspaceMutations;
  const agentRepo = yield* CodingAgentRepository;
  const targetDir = path.join(
    path.resolve("."),
    REGISTRY_EXTENSIONS_DIR,
    owner,
    "commands",
    args.name,
  );
  const dirExists = yield* fs.exists(targetDir).pipe(Effect.orElseSucceed(() => false));

  if (dirExists) {
    return yield* makeAppError({
      code: "conflict",
      message: `Managed command directory already exists: ${targetDir}`,
      breadcrumbs: [
        {
          task: "Recover",
          description: "Choose a different name or remove the existing directory first",
        },
      ],
    });
  }

  // 4. Build operation
  const op = {
    name: "new-command",
    args: { name: args.name, owner, description: args.description, force: args.force },
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
      Effect.provideService(WorkspaceMutations, ws),
      Effect.provideService(CodingAgentRepository, agentRepo),
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

  const breadcrumbs = [
    {
      task: "edit",
      description: `Edit \`.axm/extensions/${owner}/commands/${args.name}/src/${args.name}.md\` to fill in instructions`,
    },
    {
      task: "sync",
      description: "Apply changes to your workspace",
      command: ["axm", "sync"],
    },
  ];

  const emitted = yield* emitPlanResolutionResult(
    "commands.new",
    resolution,
    resolution._tag === "ExecutedPlan"
      ? { summary: `Created command ${fqn}`, breadcrumbs }
      : undefined,
  );

  if (resolution._tag === "ExecutedPlan") {
    yield* renderer.success(`Created command ${fqn}`, { breadcrumbs, withoutBreadcrumbs: emitted });
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
    }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withAuthRuntime("commands new")),
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

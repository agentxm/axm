import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  buildNewExtensionStep,
  decodeExtensionNameSync,
  EXTENSION_NAME_MAX_LENGTH,
  EXTENSION_NAME_PATTERN,
  formatFqn,
  normalizeHandle,
  REGISTRY_EXTENSIONS_DIR,
  type ExtensionName,
} from "@agentxm/client-core/unstable/extensions";
import type {
  NewCommandOperation,
  RegistryCommandRef,
} from "@agentxm/client-core/unstable/commands";
import {
  CommandManager,
  commandInstallArtifact,
  newCommand as newCommandOp,
} from "@agentxm/client-core/unstable/commands";
import { CliRenderer, count } from "@agentxm/client-core/unstable/cli-renderer";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  DEFAULT_WORKSPACE_SCOPE,
  WorkspaceMutations,
} from "@agentxm/client-core/unstable/workspace";
import type { JobStepArtifact, Plan, PlanResolution } from "@agentxm/client-core/unstable/plan";
import { emitPlanResolutionResult } from "../../json-output.js";
import { withAuthRuntime, withWorkspace } from "../../runtime.js";
import { resolveOwnerForNewContent } from "../shared/resolve-owner.js";
import { joinDisplayPath } from "../shared/display-path.js";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import { emitScaffoldSuccess } from "../shared/scaffold-success.js";
import { toJobStepResult } from "../shared/job-step-result.js";
import { decodeVersionSync } from "@agentxm/client-core/unstable/version-constraints";

export interface CommandsNewHandlerArgs {
  readonly name: ExtensionName;
  readonly description: string;
  readonly owner: Option.Option<string>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

const commandNewArtifactOutput = (
  resolution: PlanResolution,
): { readonly targetPhrase: string; readonly summary: string } | undefined => {
  if (resolution._tag !== "ExecutedPlan") return undefined;

  for (const job of resolution.jobs) {
    for (const step of job.steps) {
      if (step.result.result !== "success" || step.result.artifact === undefined) continue;

      const artifact = step.result.artifact;
      const targetPhrase = commandNewTargetPhrase(artifact);
      const summary = commandNewArtifactSummary(artifact);
      return { targetPhrase, summary };
    }
  }

  return undefined;
};

const commandNewTargetPhrase = (artifact: JobStepArtifact): string => {
  if (artifact.agents !== undefined && artifact.agents.length > 0) {
    return ` for ${count(artifact.agents.length, "agent")}`;
  }
  if (artifact.targets !== undefined && artifact.targets.length > 0) {
    return ` for ${count(artifact.targets.length, "location")}`;
  }
  return "";
};

const commandNewArtifactSummary = (artifact: JobStepArtifact): string => {
  const targetSummary =
    artifact.targets !== undefined && artifact.targets.length > 0
      ? `-> ${count(artifact.targets.length, "location")}`
      : `-> ${artifact.path}`;
  const details = [
    artifact.version,
    artifact.fileCount === undefined ? undefined : count(artifact.fileCount, "file"),
  ].filter((part): part is string => part !== undefined && part.length > 0);

  return details.length === 0 ? targetSummary : `${targetSummary}   ${details.join(" | ")}`;
};

const normalizeOwner = (s: string) => normalizeHandle(s.startsWith("@") ? s : `@${s}`);

export const handleCommandsNew = Effect.fn("CommandsNew.handle")(function* (
  args: CommandsNewHandlerArgs,
) {
  const renderer = yield* CliRenderer;

  // 1. Resolve owner
  const owner = Option.isSome(args.owner)
    ? normalizeOwner(args.owner.value)
    : yield* resolveOwnerForNewContent("command creation");

  // 2. Validate name
  if (
    args.name.length === 0 ||
    args.name.length > EXTENSION_NAME_MAX_LENGTH ||
    !EXTENSION_NAME_PATTERN.test(args.name)
  ) {
    return yield* makeAppError({
      code: "validation",
      detail: `Invalid command name: "${args.name}"`,
      suggestions: [
        {
          description: "Choose a name matching /^[a-z0-9][a-z0-9-]*$/ (max 64 chars)",
        },
      ],
    });
  }

  // 3. Check the managed extension directory doesn't already exist
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const ws = yield* WorkspaceMutations;
  const manager = yield* CommandManager;
  const targetDir = path.join(ws.baseDir, REGISTRY_EXTENSIONS_DIR, owner, "commands", args.name);
  const dirExists = yield* fs.exists(targetDir).pipe(Effect.orElseSucceed(() => false));

  if (dirExists) {
    return yield* makeAppError({
      code: "conflict",
      detail: `Managed command directory already exists: ${targetDir}`,
      suggestions: [
        {
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
  const version = decodeVersionSync("0.1.0");
  const ref: RegistryCommandRef = {
    type: "command",
    refType: "registry",
    source: { type: "registry", location: new URL("file:///"), owner: Option.some(owner) },
    owner,
    name: args.name,
    version,
    integrity: Option.none(),
    packages: [],
    command: { name: args.name },
  };

  const step = buildNewExtensionStep(manager, {
    ref,
    versionRange: Option.none(),
    label: fqn,
    message: `Created command ${fqn}`,
    markAuthored: ws.setCommandEntry(args.name, {
      source: formatFqn({ owner, type: "command", name: args.name }),
      enabled: true,
      authored: true,
    }),
    scaffold: newCommandOp(op).pipe(
      Effect.map(toJobStepResult),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.provideService(WorkspaceMutations, ws),
      Effect.provideService(CliRenderer, renderer),
    ),
    buildArtifact: () =>
      Effect.gen(function* () {
        const currentLockEntry = yield* ws.getLockedCommand(args.name);
        if (Option.isNone(currentLockEntry)) {
          return yield* makeAppError({
            code: "internal",
            detail: `Created command ${fqn} but could not read its lockfile entry`,
            suggestions: [{ description: "Inspect .axm/axm-lock.yaml." }],
          });
        }

        return commandInstallArtifact({
          lockEntry: currentLockEntry.value,
          previousLockEntry: Option.none(),
          versionRange: Option.none(),
          canonicalPath: targetDir,
          fallbackPath: args.name,
          scope: ws.scope,
          workspaceRoot: ws.baseDir,
          pathService: path,
        });
      }),
  });

  const plan: Plan = {
    _tag: "Plan",
    name: "New command",
    description: Option.some(`Create ${fqn}`),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  const resolution = yield* previewOrApplyLocalPlan(plan, {
    preview: args.preview,
    displayApplied: false,
  });

  const suggestions = [
    {
      description: `Edit \`${joinDisplayPath(path, ".axm", "extensions", owner, "commands", args.name, "src", `${args.name}.md`)}\` to fill in instructions`,
    },
  ];

  const emitted = yield* emitPlanResolutionResult(
    "commands.new",
    resolution,
    resolution._tag === "ExecutedPlan"
      ? { summary: `Created command ${fqn}`, suggestions }
      : undefined,
  );

  if (resolution._tag === "ExecutedPlan") {
    const artifactOutput = commandNewArtifactOutput(resolution);
    yield* emitScaffoldSuccess({
      message: `Created command ${fqn}${artifactOutput?.targetPhrase ?? ""}`,
      ...(artifactOutput === undefined ? {} : { summary: artifactOutput.summary }),
      suggestions,
      withoutSuggestions: emitted,
    });
  }
});

const newConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the command")),
  description: Flag.string("description").pipe(
    Flag.withDescription("Description for the command"),
    Flag.withDefault(""),
  ),
  owner: Flag.string("owner").pipe(
    Flag.withDescription("Override the workspace owner (e.g., @acme)"),
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
  ({ name, description, owner, yes, force, preview }) =>
    handleCommandsNew({
      name: decodeExtensionNameSync(name),
      description,
      owner,
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
      command: "axm commands new my-command --owner @acme",
      description: "Create under a specific owner",
    },
  ]),
);

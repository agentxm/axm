import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { previewFlag, Verbosity } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  extensionTypeSentenceLabels,
  extensionTypeToPlural,
  fqnInvalidErrorToAppError,
  parseFqn,
} from "@agentxm/client-core/unstable/extensions";
import {
  DEFAULT_WORKSPACE_SCOPE,
  WorkspaceMutations,
} from "@agentxm/client-core/unstable/workspace";
import {
  type CompletedJobStep,
  type ExecutedPlan,
  type JobStepArtifact,
  type JobStepResult,
  type Plan,
  type PlanResolution,
} from "@agentxm/client-core/unstable/plan";

import { emitPlanResolutionResult } from "../../json-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  bumpManifestVersion,
  isVersionableType,
  versionableTypes,
  type BumpManifestVersionResult,
  type VersionableExtensionType,
  type VersionBump,
} from "./extension-version.js";

export interface VersionHandlerArgs {
  readonly type: VersionableExtensionType;
  readonly handle: string;
  readonly bump: string;
  readonly targetVersion: Option.Option<string>;
  readonly preview: boolean;
}

const versionResultMessage = (
  result: BumpManifestVersionResult,
  verb: "Updated" | "Would update",
): string => {
  return `${verb} ${extensionTypeSentenceLabels[result.type]} ${result.fqn} ${result.from} -> ${result.to}`;
};

const versionNoOpMessage = (result: BumpManifestVersionResult): string =>
  `Already up to date — ${extensionTypeSentenceLabels[result.type]} ${result.fqn} ${result.to}`;

const versionResultSummary = (result: BumpManifestVersionResult) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const path = yield* Path.Path;
    return `-> ${path.relative(ws.baseDir, result.manifestPath)}`;
  });

const versionArtifact = (result: BumpManifestVersionResult) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const path = yield* Path.Path;
    const changed = result.from !== result.to;
    return {
      path: path.relative(ws.baseDir, result.manifestPath),
      scope: ws.scope,
      version: result.to,
      previousVersion: result.from,
      change: changed ? "updated" : "unchanged",
      ...(changed ? { fileCount: 1 } : {}),
    } satisfies JobStepArtifact;
  });

const noopStepResult = {
  result: "success",
  message: "",
} satisfies JobStepResult;

const makeVersionPlan = (result: BumpManifestVersionResult): Plan => ({
  _tag: "Plan",
  name: "Update extension version",
  description: Option.none(),
  jobs: [
    {
      concurrency: 1,
      steps: [
        {
          label: result.fqn,
          readiness: "ready",
          message: `${result.from} -> ${result.to}`,
          run: Effect.succeed(noopStepResult),
        },
      ],
    },
  ],
});

const previewVersionPlan = (plan: Plan): PlanResolution => ({
  _tag: "PreviewedPlan",
  name: plan.name,
  description: plan.description,
  jobs: plan.jobs,
});

const executedVersionPlan = (
  plan: Plan,
  result: BumpManifestVersionResult,
): Effect.Effect<ExecutedPlan, never, WorkspaceMutations | Path.Path> =>
  Effect.gen(function* () {
    const artifact = yield* versionArtifact(result);
    const step = {
      label: result.fqn,
      result: {
        result: "success",
        message: `${result.from} -> ${result.to}`,
        artifact,
      },
    } satisfies CompletedJobStep;

    return {
      _tag: "ExecutedPlan",
      name: plan.name,
      description: plan.description,
      jobs: [
        {
          concurrency: 1,
          steps: [step],
        },
      ],
    } satisfies ExecutedPlan;
  });

const parseBump = (bump: string) => {
  switch (bump) {
    case "patch":
    case "minor":
    case "major":
    case "prerelease":
    case "set":
      return Effect.succeed<VersionBump | "set">(bump);
    default:
      return makeAppError({
        code: "validation",
        detail: `Invalid version bump: ${bump}`,
      });
  }
};

export const handleVersion = (args: VersionHandlerArgs) =>
  Effect.gen(function* () {
    const bump = yield* parseBump(args.bump);

    if (bump === "set" && Option.isNone(args.targetVersion)) {
      return yield* makeAppError({
        code: "not_found",
        detail: "`set` requires an exact semver version",
        suggestions: [
          {
            description: "Set an exact semver version.",
            cmd: `axm ${extensionTypeToPlural[args.type]} version ${args.handle} set 1.2.3`,
          },
        ],
      });
    }

    if (bump !== "set" && Option.isSome(args.targetVersion)) {
      return yield* makeAppError({
        code: "internal",
        detail: `Version target is only valid with "set", got ${bump}`,
      });
    }

    const targetVersion = Option.getOrUndefined(args.targetVersion);
    const versionArgs = {
      fqn: args.handle,
      type: args.type,
      bump,
      ...(targetVersion === undefined ? {} : { targetVersion }),
    };

    const previewResult = yield* bumpManifestVersion({
      ...versionArgs,
      preview: true,
    });
    const plan = makeVersionPlan(previewResult);
    const resolution = args.preview
      ? previewVersionPlan(plan)
      : yield* bumpManifestVersion({
          ...versionArgs,
          preview: false,
        }).pipe(Effect.flatMap((applied) => executedVersionPlan(plan, applied)));

    const renderer = yield* CliRenderer;
    if (yield* emitPlanResolutionResult("version", resolution)) {
      return;
    }

    const verbosity = yield* Verbosity;
    const message =
      !args.preview && previewResult.from === previewResult.to
        ? versionNoOpMessage(previewResult)
        : versionResultMessage(previewResult, args.preview ? "Would update" : "Updated");
    const summary = yield* versionResultSummary(previewResult);
    if (!args.preview) {
      yield* renderer.success(message, verbosity.level === "quiet" ? undefined : { summary });
      return;
    }

    yield* renderer.info(verbosity.level === "quiet" ? message : `${message}\n  ${summary}`);
  });

const exampleNamesByType: Record<VersionableExtensionType, string> = {
  command: "my-cmd",
  skill: "code-review",
  subagent: "researcher",
  "mcp-server": "my-server",
  hook: "block-secrets",
  pack: "frontend-tools",
};

const makeVersionCommand = (type: VersionableExtensionType) => {
  const plural = extensionTypeToPlural[type];
  const sentence = extensionTypeSentenceLabels[type];
  const exampleName = exampleNamesByType[type];
  const versionConfig = {
    handle: Argument.string("handle").pipe(
      Argument.withDescription(`Fully-qualified ${sentence} handle (@owner/${plural}/name)`),
    ),
    bump: Argument.string("bump").pipe(Argument.withDescription("Version bump rule or set")),
    targetVersion: Argument.string("version").pipe(
      Argument.withDescription("Exact semver version for set"),
      Argument.optional,
    ),
    preview: previewFlag.pipe(Flag.withDescription("Print the bump without writing")),
  } as const;

  return Command.make("version", versionConfig, ({ handle, bump, targetVersion, preview }) =>
    handleVersion({ type, handle, bump, targetVersion, preview }).pipe(
      withWorkspace(DEFAULT_WORKSPACE_SCOPE),
      withRuntime(`${plural} version`),
    ),
  ).pipe(
    withArgvTracking(versionConfig),
    Command.withDescription(`Bump a managed ${sentence} manifest version`),
    Command.withExamples([
      {
        command: `axm ${plural} version @acme/${plural}/${exampleName} patch`,
        description: "Bump the patch version",
      },
      {
        command: `axm ${plural} version @acme/${plural}/${exampleName} set 1.2.3`,
        description: "Set an exact version",
      },
    ]),
  );
};

export const commandsVersionCommand = makeVersionCommand("command");
export const skillsVersionCommand = makeVersionCommand("skill");
export const subagentsVersionCommand = makeVersionCommand("subagent");
export const mcpsVersionCommand = makeVersionCommand("mcp-server");
export const packsVersionCommand = makeVersionCommand("pack");

export interface RootVersionHandlerArgs {
  readonly handle: string;
  readonly bump: string;
  readonly targetVersion: Option.Option<string>;
  readonly preview: boolean;
}

const supportedHandleHints = versionableTypes
  .map((type) => `\`@owner/${extensionTypeToPlural[type]}/name\``)
  .join(", ");

const inferVersionableType = (handle: string) =>
  Effect.gen(function* () {
    const fqn = yield* Effect.fromResult(
      Result.mapError(parseFqn(handle), fqnInvalidErrorToAppError),
    );
    if (!isVersionableType(fqn.type)) {
      return yield* makeAppError({
        code: "validation",
        detail: `Versioning is not supported for ${extensionTypeToPlural[fqn.type]}, got ${handle}`,
        suggestions: [{ description: `Use a handle like ${supportedHandleHints}.` }],
      });
    }
    return fqn.type;
  });

export const handleRootVersion = (args: RootVersionHandlerArgs) =>
  Effect.gen(function* () {
    const type = yield* inferVersionableType(args.handle);
    return yield* handleVersion({ ...args, type });
  });

const supportedTypePluralPattern = versionableTypes
  .map((type) => extensionTypeToPlural[type])
  .join("|");

const rootVersionConfig = {
  handle: Argument.string("handle").pipe(
    Argument.withDescription(
      `Fully-qualified extension handle (@owner/<${supportedTypePluralPattern}>/name)`,
    ),
  ),
  bump: Argument.string("bump").pipe(Argument.withDescription("Version bump rule or set")),
  targetVersion: Argument.string("version").pipe(
    Argument.withDescription("Exact semver version for set"),
    Argument.optional,
  ),
  preview: previewFlag.pipe(Flag.withDescription("Print the bump without writing")),
} as const;

export const versionCommand = Command.make(
  "version",
  rootVersionConfig,
  ({ handle, bump, targetVersion, preview }) =>
    handleRootVersion({ handle, bump, targetVersion, preview }).pipe(
      withWorkspace(DEFAULT_WORKSPACE_SCOPE),
      withRuntime("version"),
    ),
).pipe(
  withArgvTracking(rootVersionConfig),
  Command.withDescription("Bump a managed extension manifest version"),
  Command.withExamples([
    {
      command: "axm version @acme/commands/my-cmd patch",
      description: "Bump a command's patch version",
    },
    {
      command: "axm version @acme/skills/code-review minor",
      description: "Bump a skill's minor version",
    },
    {
      command: "axm version @acme/subagents/researcher patch",
      description: "Bump a subagent's patch version",
    },
    {
      command: "axm version @acme/mcps/my-server minor",
      description: "Bump an MCP server's minor version",
    },
    {
      command: "axm version @acme/packs/frontend-tools set 1.2.3",
      description: "Set an exact pack version",
    },
  ]),
);

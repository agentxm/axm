import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/extension-management/unstable/app-error";
import { CliRenderer } from "@agentxm/extension-management/unstable/cli-renderer";
import { previewFlag, Verbosity } from "@agentxm/extension-management/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";
import {
  extensionTypeSentenceLabels,
  extensionTypeToPlural,
  parseFqn,
} from "@agentxm/extension-model/unstable/extensions";
import { fqnInvalidErrorToAppError } from "@agentxm/extension-management/unstable/app-error/conversions";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import {
  makeOperationResolution,
  operationPresentation,
  type JobStepArtifact,
} from "@agentxm/workspace-operations";

import { emitOperationResolution } from "../../operation-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { withOperationLifecycle } from "./operation-lifecycle.js";
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

const entrySource = (entry: unknown): string | undefined => {
  if (typeof entry === "string") return entry;
  if (typeof entry !== "object" || entry === null || !("source" in entry)) return undefined;
  return typeof entry.source === "string" ? entry.source : undefined;
};

const configuredSourceForVersionTarget = Effect.fn("Version.configuredSourceForTarget")(function* (
  type: VersionableExtensionType,
  name: string,
) {
  const ws = yield* WorkspaceMutations;
  switch (type) {
    case "skill":
      return entrySource((yield* ws.getConfiguredSkillEntries())[name]);
    case "mcp-server":
      return entrySource((yield* ws.getConfiguredMcpServerEntries())[name]);
    case "subagent":
      return entrySource((yield* ws.getConfiguredSubagentEntries())[name]);
    case "pack":
      return entrySource((yield* ws.getConfiguredPackEntries())[name]);
    case "hook":
      return entrySource((yield* ws.getConfiguredHookEntries())[name]);
    case "rule":
      return entrySource((yield* ws.getConfiguredRuleEntries())[name]);
    case "knowledge":
      return entrySource((yield* ws.getConfiguredKnowledgeEntries())[name]);
  }
});

const versionResultMessage = (
  result: BumpManifestVersionResult,
  verb: "Updated" | "Would update",
): string => {
  return `${verb} ${extensionTypeSentenceLabels[result.type]} ${result.fqn} ${result.from} -> ${result.to}`;
};

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

const versionPresentation = (type: VersionableExtensionType) =>
  operationPresentation({ imperative: "update", past: "Updated", gerund: "Updating" }, type);

const previewVersionResolution = (result: BumpManifestVersionResult) =>
  makeOperationResolution({
    name: "Update extension version",
    description: Option.none(),
    mode: "preview",
    atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
    units: [
      {
        id: result.fqn,
        label: result.fqn,
        state: "ready",
        message: `${result.from} -> ${result.to}`,
      },
    ],
    presentation: versionPresentation(result.type),
  });

const executedVersionResolution = (result: BumpManifestVersionResult) =>
  Effect.gen(function* () {
    const artifact = yield* versionArtifact(result);
    return makeOperationResolution({
      name: "Update extension version",
      description: Option.none(),
      mode: "apply",
      atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
      units: [
        {
          id: result.fqn,
          label: result.fqn,
          state: artifact.change === "unchanged" ? "unchanged" : "committed",
          message: `${result.from} -> ${result.to}`,
          artifact,
        },
      ],
      presentation: versionPresentation(result.type),
    });
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
  withOperationLifecycle(
    {
      command: "version",
      mode: args.preview ? "preview" : "apply",
      planName: "Update extension version",
      presentation: versionPresentation(args.type),
    },
    handleVersionBody(args),
  );

const handleVersionBody = (args: VersionHandlerArgs) =>
  Effect.gen(function* () {
    const parsedTarget = yield* Effect.fromResult(
      Result.mapError(parseFqn(args.handle), fqnInvalidErrorToAppError),
    );
    const configuredSource = yield* configuredSourceForVersionTarget(args.type, parsedTarget.name);
    if (configuredSource === undefined || !isWorkspaceSourceLocator(configuredSource)) {
      return yield* makeAppError({
        code: "conflict",
        detail: `Cannot change the version of non-workspace ${extensionTypeSentenceLabels[args.type]} ${args.handle}`,
        recover: "Adopt or copy the package into workspace authorship before editing its manifest.",
      });
    }

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
    const resolution = args.preview
      ? previewVersionResolution(previewResult)
      : yield* bumpManifestVersion({
          ...versionArgs,
          preview: false,
        }).pipe(Effect.flatMap((applied) => executedVersionResolution(applied)));

    const { emitted } = yield* emitOperationResolution("version", resolution);

    // The preview display is the planning-time render this command owns.
    if (args.preview && !emitted) {
      const renderer = yield* CliRenderer;
      const verbosity = yield* Verbosity;
      const message = versionResultMessage(previewResult, "Would update");
      if (verbosity.level === "quiet") {
        yield* renderer.success(message);
        return;
      }
      const summary = yield* versionResultSummary(previewResult);
      yield* renderer.info(`${message}\n  ${summary}`);
    }
  });

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
  withOperationLifecycle(
    {
      command: "version",
      mode: args.preview ? "preview" : "apply",
      planName: "Update extension version",
    },
    handleRootVersionBody(args),
  );

const handleRootVersionBody = (args: RootVersionHandlerArgs) =>
  Effect.gen(function* () {
    const type = yield* inferVersionableType(args.handle);
    return yield* handleVersion({ ...args, type });
  });

const supportedTypePluralPattern = versionableTypes
  .map((type) => extensionTypeToPlural[type])
  .join("|");

const rootVersionConfig = {
  handle: Argument.string("extension").pipe(
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
  Command.withDescription("Bump a project-workspace extension manifest version"),
  Command.withExamples([
    {
      command: "axm version @acme/hooks/block-secrets patch",
      description: "Bump a hook's patch version",
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

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
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
import { isWorkspaceSourceLocator } from "@agentxm/client-core/unstable/sources";
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
import { PackManifestSchema, packTrustManifest } from "@agentxm/client-core/unstable/packs";
import { computePackageContentHash } from "@agentxm/client-core/unstable/extensions";
import * as Schema from "effect/Schema";
import { trustRecordKey } from "@agentxm/client-core/unstable/trust";

const packContentIdentity = (directory: string) =>
  computePackageContentHash(directory).pipe(
    Effect.mapError((cause) =>
      makeAppError({
        code: "internal",
        detail: `Failed to compute pack content identity at ${directory}`,
        cause,
      }),
    ),
  );

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
    if (args.type === "pack") {
      const ws = yield* WorkspaceMutations;
      const path = yield* Path.Path;
      const trust = (yield* ws.getTrustState()).records[trustRecordKey("pack", parsedTarget.name)];
      const currentIdentity = yield* packContentIdentity(path.dirname(previewResult.manifestPath));
      if (trust?.authority !== "workspace" || trust.contentIdentity !== currentIdentity) {
        return yield* makeAppError({
          code: "conflict",
          detail: `Pack ${args.handle} differs from its trusted workspace baseline`,
          recover: "Inspect and resolve the pack drift before changing its version.",
          suggestions: [
            {
              description: "Preview pack repair",
              cmd: `axm packs repair ${args.handle} --preview`,
            },
          ],
        });
      }
    }
    const plan = makeVersionPlan(previewResult);
    const resolution = args.preview
      ? previewVersionPlan(plan)
      : yield* bumpManifestVersion({
          ...versionArgs,
          preview: false,
        }).pipe(
          Effect.tap((applied) =>
            args.type !== "pack" || !applied.written
              ? Effect.void
              : Effect.gen(function* () {
                  const ws = yield* WorkspaceMutations;
                  const fs = yield* FileSystem.FileSystem;
                  const path = yield* Path.Path;
                  const raw = yield* fs.readFileString(applied.manifestPath).pipe(
                    Effect.mapError((cause) =>
                      makeAppError({
                        code: "internal",
                        detail: `Failed to read pack manifest: ${applied.manifestPath}`,
                        cause,
                      }),
                    ),
                  );
                  const parsed = yield* Effect.try({
                    try: (): unknown => JSON.parse(raw),
                    catch: (cause) =>
                      makeAppError({
                        code: "validation",
                        detail: `Invalid pack manifest after version update: ${applied.manifestPath}`,
                        cause,
                      }),
                  });
                  const manifest = yield* Schema.decodeUnknownEffect(PackManifestSchema)(
                    parsed,
                  ).pipe(
                    Effect.mapError((cause) =>
                      makeAppError({
                        code: "validation",
                        detail: `Invalid pack manifest after version update: ${applied.manifestPath}`,
                        cause,
                      }),
                    ),
                  );
                  const contentIdentity = yield* packContentIdentity(
                    path.dirname(applied.manifestPath),
                  );
                  yield* ws.refreshPackContentIdentity(
                    parsedTarget.name,
                    contentIdentity,
                    packTrustManifest(manifest),
                  );
                }).pipe(
                  Effect.catch((error) =>
                    bumpManifestVersion({
                      fqn: args.handle,
                      type: "pack",
                      bump: "set",
                      targetVersion: applied.from,
                      preview: false,
                    }).pipe(
                      Effect.catch(() => Effect.void),
                      Effect.andThen(Effect.fail(error)),
                    ),
                  ),
                ),
          ),
          Effect.flatMap((applied) => executedVersionPlan(plan, applied)),
        );

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

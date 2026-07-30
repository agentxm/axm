import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { count } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  buildNewExtensionStep,
  computeSourceHash,
  decodeExtensionNameSync,
  formatFqn,
  REGISTRY_EXTENSIONS_DIR,
} from "@agentxm/client-core/unstable/extensions";
import {
  FILES_EXTENSION_DIR,
  FILES_MANIFEST_FILENAME,
  FILES_MANIFEST_SCHEMA_URL,
  FilesManager,
  type FilesManifest,
  type WorkspaceFilesRef,
} from "@agentxm/client-core/unstable/files";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import type {
  JobStepArtifact,
  JobStepArtifactTarget,
  Plan,
  PlanResolution,
} from "@agentxm/client-core/unstable/plan";
import type { FilesLockEntry } from "@agentxm/client-core/unstable/lockfile";
import { emitPlanResolutionResult } from "../../json-output.js";
import { withAuthRuntime, withWorkspace } from "../../runtime.js";
import {
  DEFAULT_WORKSPACE_SCOPE,
  WorkspaceMutations,
} from "@agentxm/client-core/unstable/workspace";
import { resolveOwnerForNewContent } from "../shared/resolve-owner.js";
import { decodeVersionSync } from "@agentxm/client-core/unstable/version-constraints";
import { joinDisplayPath } from "../shared/display-path.js";
import { emitScaffoldSuccess } from "../shared/scaffold-success.js";
import { normalizeScaffoldOwner } from "../shared/scaffold-name.js";

const filesLockEntryVersion = (entry: FilesLockEntry): string | undefined =>
  entry.type === "registry"
    ? entry.resolvedVersion
    : entry.type === "workspace"
      ? entry.version
      : undefined;

const filesNewArtifact = (args: {
  readonly lockEntry: FilesLockEntry;
  readonly targets: ReadonlyArray<JobStepArtifactTarget>;
  readonly canonicalPath: string;
  readonly workspaceRoot: string;
  readonly scope: JobStepArtifact["scope"];
  readonly pathService: Path.Path;
}): JobStepArtifact => {
  const version = filesLockEntryVersion(args.lockEntry);
  const sourcePath = args.pathService.relative(args.workspaceRoot, args.canonicalPath);

  return {
    path: sourcePath,
    scope: args.scope,
    ...(version === undefined ? {} : { version }),
    change: "created",
    ...(args.targets.length === 0 ? {} : { fileCount: args.targets.length, targets: args.targets }),
  };
};

const filesNewArtifactOutput = (
  resolution: PlanResolution,
): { readonly targetPhrase: string; readonly summary: string } | undefined => {
  if (resolution._tag !== "ExecutedPlan") return undefined;

  for (const job of resolution.jobs) {
    for (const step of job.steps) {
      if (step.result.result !== "success" || step.result.artifact === undefined) continue;

      const artifact = step.result.artifact;
      return {
        targetPhrase: filesNewTargetPhrase(artifact),
        summary: filesNewArtifactSummary(artifact),
      };
    }
  }

  return undefined;
};

const filesNewTargetPhrase = (artifact: JobStepArtifact): string => {
  if (artifact.targets !== undefined && artifact.targets.length > 0) {
    return ` with ${count(artifact.targets.length, "target")}`;
  }
  return "";
};

const filesNewArtifactSummary = (artifact: JobStepArtifact): string => {
  const targetSummary =
    artifact.targets !== undefined && artifact.targets.length > 0
      ? `-> ${count(artifact.targets.length, "target")}`
      : `-> ${artifact.path}`;
  const details = [
    artifact.version,
    artifact.fileCount === undefined ? undefined : count(artifact.fileCount, "file"),
  ].filter((part): part is string => part !== undefined && part.length > 0);

  return details.length === 0 ? targetSummary : `${targetSummary}   ${details.join(" | ")}`;
};

export const handleFilesNew = Effect.fn("FilesNew.handle")(function* (args: {
  readonly name: string;
  readonly owner: Option.Option<string>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const ws = yield* WorkspaceMutations;
  const manager = yield* FilesManager;
  const owner = Option.isSome(args.owner)
    ? normalizeScaffoldOwner(args.owner.value)
    : yield* resolveOwnerForNewContent("files package creation");
  const name = decodeExtensionNameSync(args.name);
  const version = decodeVersionSync("0.1.0");
  const fqn = formatFqn({ owner, type: "files", name });
  const targetDir = path.join(
    ws.baseDir,
    REGISTRY_EXTENSIONS_DIR,
    owner,
    FILES_EXTENSION_DIR,
    name,
  );
  const dirExists = yield* fs.exists(targetDir).pipe(Effect.orElseSucceed(() => false));

  if (dirExists && !args.force) {
    return yield* makeAppError({
      code: "conflict",
      detail: `Managed files package directory already exists: ${targetDir}`,
      suggestions: [
        {
          description: "Choose a different name or remove the existing directory first",
        },
      ],
    });
  }

  const manifest: FilesManifest = {
    $schema: FILES_MANIFEST_SCHEMA_URL,
    owner,
    name,
    version,
    type: "files",
    contents: [
      {
        source: { kind: "static", path: "README.md" },
        target: `files/${name}.md`,
        mode: "sync-once",
      },
    ],
  };
  const ref: WorkspaceFilesRef = {
    type: "files",
    refType: "workspace",
    source: { type: "workspace", owner, extensionType: "files", name },
    scope: ws.scope,
    owner,
    name,
    version,
    sourceHash: computeSourceHash("scaffold"),
    location: targetDir,
    file: { name },
  };

  const plan: Plan = {
    _tag: "Plan",
    name: "New files",
    description: Option.some(`Create ${fqn}`),
    jobs: [
      {
        concurrency: 1,
        steps: [
          buildNewExtensionStep(manager, {
            ref,
            target: { type: "files", name },
            versionRange: Option.none(),
            label: fqn,
            message: `Created ${fqn}`,
            buildArtifact: () =>
              Effect.gen(function* () {
                const currentLockEntry = yield* ws
                  .getLockedFilesEntry(name)
                  .pipe(Effect.catch(() => Effect.succeed(Option.none())));
                const materialization =
                  manager.getLastMaterialization === undefined
                    ? { agents: [], targets: [] }
                    : yield* manager.getLastMaterialization({
                        target: { type: "files", name },
                      });
                if (Option.isNone(currentLockEntry)) {
                  return {
                    path: targetDir,
                    scope: ws.scope,
                    version,
                    change: "created",
                    targets: [
                      { path: targetDir, change: "created" },
                      ...materialization.targets.map((target) => ({
                        ...target,
                        change: "created" as const,
                      })),
                    ],
                  } satisfies JobStepArtifact;
                }

                return filesNewArtifact({
                  lockEntry: currentLockEntry.value,
                  targets: materialization.targets.map((target) => ({
                    ...target,
                    change: "created",
                  })),
                  canonicalPath: targetDir,
                  workspaceRoot: ws.baseDir,
                  scope: ws.scope,
                  pathService: path,
                });
              }),
            markAuthored: ws.setFilesEntry(name, {
              source: `workspace:${fqn}`,
              enabled: true,
              inputs: {},
            }),
            scaffold: Effect.gen(function* () {
              const exists = yield* fs.exists(targetDir).pipe(Effect.orElseSucceed(() => false));
              if (exists && !args.force) {
                return yield* makeAppError({
                  code: "conflict",
                  detail: `files package directory already exists: ${targetDir}`,
                });
              }
              yield* fs.makeDirectory(path.join(targetDir, "src"), { recursive: true }).pipe(
                Effect.mapError((error) =>
                  makeAppError({
                    code: "internal",
                    detail: `Failed to create files package directory: ${targetDir}`,
                    cause: error,
                  }),
                ),
              );
              yield* fs
                .writeFileString(
                  path.join(targetDir, FILES_MANIFEST_FILENAME),
                  `${JSON.stringify(manifest, null, 2)}\n`,
                )
                .pipe(
                  Effect.mapError((error) =>
                    makeAppError({
                      code: "internal",
                      detail: `Failed to write ${FILES_MANIFEST_FILENAME}`,
                      cause: error,
                    }),
                  ),
                );
              yield* fs
                .writeFileString(path.join(targetDir, "src", "README.md"), `# ${name}\n`)
                .pipe(
                  Effect.mapError((error) =>
                    makeAppError({
                      code: "internal",
                      detail: "Failed to write files payload",
                      cause: error,
                    }),
                  ),
                );
            }),
          }),
        ],
      },
    ],
  };

  const resolution = yield* previewOrApplyLocalPlan(plan, {
    preview: args.preview,
    displayApplied: false,
  });
  const suggestions = [
    {
      description: `Edit \`${joinDisplayPath(path, ".axm", "extensions", owner, "files", name, "src", "README.md")}\` to update files content`,
    },
  ];
  const artifactOutput = filesNewArtifactOutput(resolution);
  const emitted = yield* emitPlanResolutionResult(
    "files.new",
    resolution,
    resolution._tag === "ExecutedPlan"
      ? {
          summary: `Created files package ${fqn}${artifactOutput?.targetPhrase ?? ""}`,
          suggestions,
        }
      : undefined,
  );
  if (resolution._tag === "ExecutedPlan") {
    yield* emitScaffoldSuccess({
      message: `Created files package ${fqn}${artifactOutput?.targetPhrase ?? ""}`,
      ...(artifactOutput === undefined ? {} : { summary: artifactOutput.summary }),
      suggestions,
      withoutSuggestions: emitted,
    });
  }
});

const newConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the files package")),
  owner: Flag.string("owner").pipe(
    Flag.withDescription("Override the workspace owner (e.g. @acme)"),
    Flag.optional,
  ),
  yes: yesFlag.pipe(Flag.withDescription("Create without confirmation")),
  force: forceFlag.pipe(Flag.withDescription("Overwrite if the directory exists")),
  preview: previewFlag.pipe(Flag.withDescription("Show files without creating them")),
} as const;

export const newCommand = Command.make("new", newConfig, ({ name, owner, yes, force, preview }) =>
  handleFilesNew({ name, owner, yes, force, preview }).pipe(
    withWorkspace(DEFAULT_WORKSPACE_SCOPE),
    withAuthRuntime("files new"),
  ),
).pipe(
  withArgvTracking(newConfig),
  Command.withDescription("Scaffold a new files package"),
  Command.withExamples([
    {
      command: "axm files new workspace-baseline --owner @acme",
      description: "Scaffold a files package",
    },
  ]),
);

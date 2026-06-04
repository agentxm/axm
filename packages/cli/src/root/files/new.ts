import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  buildNewExtensionStep,
  decodeExtensionNameSync,
  formatFqn,
  normalizeHandle,
  REGISTRY_EXTENSIONS_DIR,
} from "@agentxm/client-core/unstable/extensions";
import {
  FILES_EXTENSION_DIR,
  FILES_MANIFEST_FILENAME,
  FILES_MANIFEST_SCHEMA_URL,
  FilesManager,
  type FilesManifest,
  type RegistryFilesRef,
} from "@agentxm/client-core/unstable/files";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import type { Plan } from "@agentxm/client-core/unstable/plan";
import { emitPlanResolutionResult } from "../../json-output.js";
import { withAuthRuntime, withWorkspace } from "../../runtime.js";
import {
  DEFAULT_WORKSPACE_SCOPE,
  WorkspaceMutations,
} from "@agentxm/client-core/unstable/workspace";
import { resolveOwnerForNewContent } from "../shared/resolve-owner.js";
import { decodeVersionSync } from "@agentxm/client-core/unstable/version-constraints";
import { joinDisplayPath } from "../shared/display-path.js";

export const handleFilesNew = Effect.fn("FilesNew.handle")(function* (args: {
  readonly name: string;
  readonly owner: Option.Option<string>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}) {
  const renderer = yield* CliRenderer;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const ws = yield* WorkspaceMutations;
  const manager = yield* FilesManager;
  const owner = Option.isSome(args.owner)
    ? normalizeHandle(args.owner.value.startsWith("@") ? args.owner.value : `@${args.owner.value}`)
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
  const ref: RegistryFilesRef = {
    type: "files",
    refType: "registry",
    source: { type: "registry", location: new URL("file:///"), owner: Option.some(owner) },
    owner,
    name,
    version,
    integrity: Option.none(),
    packages: [],
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
            versionRange: Option.none(),
            label: fqn,
            message: `Created ${fqn}`,
            markAuthored: ws.setFilesEntry(name, {
              source: fqn,
              enabled: true,
              authored: true,
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

  const resolution = yield* previewOrApplyLocalPlan(plan, { preview: args.preview });
  const suggestions = [
    {
      description: `Edit \`${joinDisplayPath(path, ".axm", "extensions", owner, "files", name, "src", "README.md")}\` to update files content`,
    },
  ];
  const emitted = yield* emitPlanResolutionResult(
    "files.new",
    resolution,
    resolution._tag === "ExecutedPlan" ? { summary: `Created ${fqn}`, suggestions } : undefined,
  );
  if (resolution._tag === "ExecutedPlan") {
    yield* renderer.success(`Created ${fqn}`, { suggestions, withoutSuggestions: emitted });
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

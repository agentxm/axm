import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { withAuthGuard } from "@agentxm/client-core/unstable/auth";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  REGISTRY_EXTENSIONS_DIR,
  parseRegistrySourcePatternParts,
} from "@agentxm/client-core/unstable/extensions";
import {
  FILES_EXTENSION_DIR,
  FILES_MANIFEST_FILENAME,
  FilesManifestSchema,
  type FilesManifest,
} from "@agentxm/client-core/unstable/files";
import type { JobStepResult, Plan } from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { createRegistryClient, type VersionEntry } from "@agentxm/client-core/unstable/registry";
import { buildZipArchive, computeIntegrity } from "@agentxm/client-core/unstable/utils";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { emitPlanResolutionResult } from "../../json-output.js";
import { AuthLayer, withRuntime, withWorkspace } from "../../runtime.js";
import { scopeFlag } from "../../cli-flags.js";

const decodeManifest = Schema.decodeUnknownEffect(FilesManifestSchema);

const isAppError = (error: unknown): error is AppError =>
  typeof error === "object" && error !== null && "_tag" in error && error._tag === "AppError";

const toAppError = (error: AppError | unknown): AppError =>
  isAppError(error)
    ? error
    : makeAppError({
        code: "internal",
        detail: "Failed to publish files package",
        cause: error,
      });

const publishFiles = (args: {
  readonly input: string;
  readonly registry: Option.Option<string>;
}): Effect.Effect<
  JobStepResult,
  AppError,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const parsed = parseRegistrySourcePatternParts(args.input);
    if (parsed === undefined || parsed.type !== "files" || parsed.name === undefined) {
      return yield* makeAppError({
        code: "validation",
        detail: "Use @owner/files/name",
      });
    }

    const extensionDir = path.join(
      ws.baseDir,
      REGISTRY_EXTENSIONS_DIR,
      parsed.owner,
      FILES_EXTENSION_DIR,
      parsed.name,
    );
    const manifestPath = path.join(extensionDir, FILES_MANIFEST_FILENAME);
    const manifestJson = yield* fs.readFileString(manifestPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to read ${manifestPath}`,
          cause: error,
        }),
      ),
      Effect.flatMap((content) =>
        Effect.try({
          try: (): unknown => JSON.parse(content),
          catch: (error) =>
            makeAppError({
              code: "validation",
              detail: `Invalid JSON in ${FILES_MANIFEST_FILENAME}`,
              cause: error,
            }),
        }),
      ),
    );
    const manifest: FilesManifest = yield* decodeManifest(manifestJson).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "validation",
          detail: `Invalid ${FILES_MANIFEST_FILENAME}`,
          cause: error,
        }),
      ),
    );
    const archive = yield* buildZipArchive(extensionDir);
    const integrity = yield* computeIntegrity(archive);
    const registrySources = yield* ws.getRegistrySourceHosts();
    const targetName = Option.getOrElse(args.registry, () => registrySources[0]?.name ?? "default");
    const target = yield* ws.getConfiguredSourceByName(targetName);
    if (Option.isNone(target) || target.value.type !== "registry") {
      return yield* makeAppError({
        code: "not_found",
        detail: `Registry source "${targetName}" not found`,
      });
    }
    const client = yield* createRegistryClient(target.value.location.href);
    const metadata: VersionEntry = {
      version: manifest.version,
      published: new Date().toISOString(),
      integrity,
      ...(manifest.packages !== undefined ? { packages: manifest.packages } : {}),
    };
    const response = yield* client.publishExtension({
      owner: parsed.owner,
      type: "files",
      name: parsed.name,
      version: manifest.version,
      archive,
      metadata,
    });
    return {
      result: "success",
      message: `Published ${args.input}@${manifest.version}`,
      ...(response.links !== undefined ? { links: response.links } : {}),
    } satisfies JobStepResult;
  }).pipe(Effect.mapError(toAppError));

export const handleFilesPublish = Effect.fn("FilesPublish.handle")(function* (args: {
  readonly input: string;
  readonly registry: Option.Option<string>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const runPublishPlan = Effect.gen(function* () {
    const plan: Plan = {
      _tag: "Plan",
      name: "Publish files",
      description: Option.some(`Publish ${args.input}`),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              readiness: "ready",
              label: args.input,
              run: publishFiles({ input: args.input, registry: args.registry }).pipe(
                Effect.provideService(FileSystem.FileSystem, fs),
                Effect.provideService(Path.Path, path),
                Effect.provideService(WorkspaceMutations, ws),
              ),
            },
          ],
        },
      ],
    };
    const resolution = yield* previewOrApplyPlan(plan, args);
    yield* emitPlanResolutionResult("files.publish", resolution);
  });

  if (args.preview) {
    yield* runPublishPlan;
    return;
  }

  const registries = yield* ws.getRegistrySourceHosts();
  const namedRegistry = Option.isSome(args.registry)
    ? yield* ws.getConfiguredSourceByName(args.registry.value)
    : Option.none();
  const registryUrl =
    Option.isSome(namedRegistry) && namedRegistry.value.type === "registry"
      ? namedRegistry.value.location.href
      : registries[0]?.location.href;
  yield* withAuthGuard(runPublishPlan, {
    registryUrl: registryUrl ?? "https://registry.agentxm.ai",
  });
});

const publishConfig = {
  input: Argument.string("input").pipe(
    Argument.withDescription("files package FQN (@owner/files/name)"),
  ),
  registry: Flag.string("registry").pipe(
    Flag.withDescription("Registry source name to publish to"),
    Flag.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Publish from project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Publish without confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription(
      "Bypass conflict warnings where supported; published versions remain immutable",
    ),
  ),
  preview: previewFlag.pipe(Flag.withDescription("Show what would publish without uploading")),
} as const;

export const publishCommand = Command.make(
  "publish",
  publishConfig,
  ({ input, registry, scope, yes, force, preview }) => {
    const program = handleFilesPublish({ input, registry, yes, force, preview }).pipe(
      withWorkspace(scope),
    );
    return program.pipe(Effect.provide(AuthLayer), withRuntime("files publish"));
  },
).pipe(
  withArgvTracking(publishConfig),
  Command.withDescription("Publish a files package"),
  Command.withExamples([
    {
      command: "axm files publish @acme/files/workspace-baseline",
      description: "Publish a files package",
    },
  ]),
);

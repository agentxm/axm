import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { withAuthGuard } from "@agentxm/client-core/unstable/auth";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import {
  forceFlag,
  previewFlag,
  Verbosity,
  yesFlag,
} from "@agentxm/client-core/unstable/cli-flags";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  REGISTRY_EXTENSIONS_DIR,
  parseRegistrySourcePatternParts,
  type ExtensionName,
  type Handle,
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
import { emitPublishResult } from "../../json-output.js";
import { AuthLayer, withRuntime, withWorkspace } from "../../runtime.js";
import { scopeFlag } from "../../cli-flags.js";
import { publishArtifact } from "../shared/publish-artifact.js";
import { publishSuccessRender } from "../shared/publish-success.js";
import { skipExistingFlag } from "../shared/publish-flags.js";
import { VERSION_ALREADY_PUBLISHED_REASON } from "../shared/publish-preflight.js";
import { recoverPublishConflictAsSkipExisting } from "../shared/publish-skip-existing.js";

const decodeManifest = Schema.decodeUnknownEffect(FilesManifestSchema);

interface FilesPublishSubject {
  readonly owner: Handle;
  readonly name: ExtensionName;
  readonly fqn: string;
  readonly extensionDir: string;
  readonly manifest: FilesManifest;
}

interface FilesPublishRegistry {
  readonly name: string;
  readonly url: string;
}

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

const isUnsupportedRegistryTypeError = (error: unknown): boolean =>
  isAppError(error) &&
  error.code === "internal" &&
  error.detail.includes("Remote discovery response does not match expected schema");

const readFilesPublishSubject = (input: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const parsed = parseRegistrySourcePatternParts(input);
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

    return {
      owner: parsed.owner,
      name: parsed.name,
      fqn: `${parsed.owner}/files/${parsed.name}`,
      extensionDir,
      manifest,
    } satisfies FilesPublishSubject;
  });

const resolveFilesPublishRegistry = (registry: Option.Option<string>) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const registrySources = yield* ws.getRegistrySourceHosts();
    const targetName = Option.getOrElse(registry, () => registrySources[0]?.name ?? "default");
    const target = yield* ws.getConfiguredSourceByName(targetName);
    if (Option.isNone(target) || target.value.type !== "registry") {
      return yield* makeAppError({
        code: "not_found",
        detail: `Registry source "${targetName}" not found`,
      });
    }

    return {
      name: targetName,
      url: target.value.location.href,
    } satisfies FilesPublishRegistry;
  });

const checkFilesPublishVersionPreflight = (args: {
  readonly subject: FilesPublishSubject;
  readonly registry: FilesPublishRegistry;
  readonly skipExisting?: boolean;
}) =>
  Effect.gen(function* () {
    const client = yield* createRegistryClient(args.registry.url);
    const indexOption = yield* client
      .getExtensionIndex({
        owner: args.subject.owner,
        type: "files",
        name: args.subject.name,
      })
      .pipe(
        Effect.catch((error) =>
          isUnsupportedRegistryTypeError(error)
            ? Effect.fail(
                makeAppError({
                  code: "unavailable",
                  detail: `Registry source "${args.registry.name}" does not support files package publish checks.`,
                  suggestions: [
                    {
                      description:
                        "Use another registry source or retry after the registry supports files packages.",
                    },
                  ],
                  cause: error,
                }),
              )
            : Effect.fail(error),
        ),
      );

    const identity = {
      owner: args.subject.owner,
      type: "files",
      name: args.subject.name,
      version: args.subject.manifest.version,
    } as const;

    if (Option.isNone(indexOption)) return { action: "publish" as const, identity };

    const existingVersion = indexOption.value.versions.find(
      (entry) => entry.version === args.subject.manifest.version,
    );
    if (existingVersion === undefined) return { action: "publish" as const, identity };

    if (args.skipExisting === true) {
      return {
        action: "skip" as const,
        identity,
        reason: VERSION_ALREADY_PUBLISHED_REASON,
      };
    }

    return yield* makeAppError({
      code: "conflict",
      detail: `Cannot publish: version ${args.subject.manifest.version} is already published for ${args.subject.fqn}. Published versions are immutable.`,
      suggestions: [
        {
          description: `Bump the version in \`.axm/extensions/${args.subject.owner}/files/${args.subject.name}/${FILES_MANIFEST_FILENAME}\`.`,
        },
      ],
    });
  });

const publishFiles = (args: {
  readonly subject: FilesPublishSubject;
  readonly registry: FilesPublishRegistry;
}): Effect.Effect<
  JobStepResult,
  AppError,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations
> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const archive = yield* buildZipArchive(args.subject.extensionDir);
    const integrity = yield* computeIntegrity(archive);
    const client = yield* createRegistryClient(args.registry.url);
    const metadata: VersionEntry = {
      version: args.subject.manifest.version,
      published: yield* DateTime.now,
      integrity,
      ...(args.subject.manifest.packages !== undefined
        ? { packages: args.subject.manifest.packages }
        : {}),
    };
    const response = yield* client.publishExtension({
      owner: args.subject.owner,
      type: "files",
      name: args.subject.name,
      version: args.subject.manifest.version,
      archive,
      metadata,
    });
    const publishedPath =
      response.links?.html ?? `${args.subject.fqn}@${args.subject.manifest.version}`;
    return {
      result: "success",
      message: `Published ${args.subject.fqn}@${args.subject.manifest.version}`,
      artifact: publishArtifact({
        path: publishedPath,
        scope: ws.scope,
        version: args.subject.manifest.version,
      }),
      ...(response.links !== undefined ? { links: response.links } : {}),
    } satisfies JobStepResult;
  }).pipe(Effect.mapError(toAppError));

export const handleFilesPublish = Effect.fn("FilesPublish.handle")(function* (args: {
  readonly input: string;
  readonly registry: Option.Option<string>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
  readonly skipExisting?: boolean;
}) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const renderer = yield* CliRenderer;
  const verbosity = yield* Verbosity;
  const runPublishPlan = Effect.gen(function* () {
    const subject = yield* readFilesPublishSubject(args.input).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.provideService(WorkspaceMutations, ws),
    );
    const registry = yield* resolveFilesPublishRegistry(args.registry).pipe(
      Effect.provideService(WorkspaceMutations, ws),
    );
    const preflightDecision = yield* checkFilesPublishVersionPreflight({
      subject,
      registry,
      skipExisting: args.skipExisting === true,
    });

    if (preflightDecision.action === "skip") {
      const message = `Skipped ${subject.fqn}@${subject.manifest.version}: version already published`;
      const emitted = yield* emitPublishResult("files.publish", {
        mode: args.preview ? "preview" : "apply",
        results: [
          {
            owner: preflightDecision.identity.owner,
            type: preflightDecision.identity.type,
            name: preflightDecision.identity.name,
            version: preflightDecision.identity.version,
            action: "skip",
            reason: preflightDecision.reason,
            ...(args.preview ? {} : { status: "success" }),
            message,
          },
        ],
      });
      if (emitted) return;
      yield* renderer.success(message);
      return;
    }

    if (args.preview) {
      const emitted = yield* emitPublishResult("files.publish", {
        mode: "preview",
        results: [
          {
            owner: preflightDecision.identity.owner,
            type: preflightDecision.identity.type,
            name: preflightDecision.identity.name,
            version: preflightDecision.identity.version,
            action: "publish",
          },
        ],
      });
      if (emitted) return;
    }

    const plan: Plan = {
      _tag: "Plan",
      name: "Publish files",
      description: Option.some(`Publish ${subject.fqn} to registry "${registry.name}"`),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              readiness: "ready",
              label: `Publish ${subject.fqn}`,
              run: publishFiles({ subject, registry }).pipe(
                Effect.catch(
                  args.skipExisting === true
                    ? recoverPublishConflictAsSkipExisting({
                        registryUrl: registry.url,
                        target: { fqn: subject.fqn, identity: preflightDecision.identity },
                        scope: ws.scope,
                      })
                    : (error) => Effect.fail(error),
                ),
                Effect.provideService(FileSystem.FileSystem, fs),
                Effect.provideService(Path.Path, path),
                Effect.provideService(WorkspaceMutations, ws),
              ),
            },
          ],
        },
      ],
    };
    const resolution = yield* previewOrApplyPlan(plan, {
      yes: args.yes,
      force: args.force,
      preview: args.preview,
      displayApplied: false,
    });

    if (resolution._tag === "ExecutedPlan") {
      const failedStepErrors = resolution.jobs
        .flatMap((job) => job.steps)
        .flatMap((step) => (step.result.result === "error" ? [step.result] : []));

      if (failedStepErrors.length > 0) {
        const [singleFailure] = failedStepErrors;
        if (failedStepErrors.length === 1 && singleFailure !== undefined) {
          return yield* singleFailure.error;
        }

        return yield* makeAppError({
          code: "internal",
          detail: `Failed to publish ${failedStepErrors.length} files packages`,
        });
      }
    }

    const success =
      resolution._tag === "ExecutedPlan" ? publishSuccessRender(resolution) : undefined;
    const emitted = yield* emitPublishResult(
      "files.publish",
      {
        mode: args.preview ? "preview" : "apply",
        results: [
          {
            owner: preflightDecision.identity.owner,
            type: preflightDecision.identity.type,
            name: preflightDecision.identity.name,
            version: preflightDecision.identity.version,
            action: "publish",
            ...(resolution._tag === "ExecutedPlan" ? { status: "success" } : {}),
            ...(success?.message !== undefined ? { message: success.message } : {}),
          },
        ],
      },
      {
        ...(success?.suggestions !== undefined ? { suggestions: success.suggestions } : {}),
      },
    );
    if (emitted) {
      return;
    }

    if (success !== undefined) {
      yield* renderer.success(
        success.message,
        verbosity.level === "quiet"
          ? undefined
          : {
              ...(success.suggestions !== undefined ? { suggestions: success.suggestions } : {}),
            },
      );
    }
  });

  if (args.preview) {
    yield* runPublishPlan;
    return;
  }

  const registry = yield* resolveFilesPublishRegistry(args.registry);
  yield* withAuthGuard(runPublishPlan, {
    registryUrl: registry.url,
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
  skipExisting: skipExistingFlag,
} as const;

export const publishCommand = Command.make(
  "publish",
  publishConfig,
  ({ input, registry, scope, yes, force, preview, skipExisting }) => {
    const program = handleFilesPublish({
      input,
      registry,
      yes,
      force,
      preview,
      skipExisting,
    }).pipe(withWorkspace(scope));
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

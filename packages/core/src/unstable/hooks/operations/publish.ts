/**
 * Publish hook executor — reads a hook manifest, runs publish lint, builds a
 * zip archive, computes the SRI integrity hash, and publishes to a target registry.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { makeAppError, type AppError } from "../../app-error/index.js";
import {
  fqnInvalidErrorToAppError,
  parseFqn,
  REGISTRY_EXTENSIONS_DIR,
} from "../../extensions/index.js";
import type { JobStepResult, Operation } from "../../plan/plan.js";
import { runPublishLintGate } from "../../publish/lint-gate.js";
import type { VersionEntry } from "../../registry/index.js";
import { createRegistryClient } from "../../registry/index.js";
import { publishArchiveOptions } from "../../publish/publish-ignore.js";
import { buildZipArchive, computeIntegrity } from "../../utils/index.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import {
  HOOK_EXTENSION_DIR,
  HOOK_MANIFEST_FILENAME,
  HookManifestSchema,
  type HookManifest,
} from "../manifest-schema.js";

/** @experimental */
export type PublishHookOperationArgs = {
  readonly name: string;
  readonly registryName: string;
};

/** @experimental */
export type PublishHookOperation = Operation<"publish-hook", PublishHookOperationArgs>;

/** @experimental */
export const publishHook: (
  op: PublishHookOperation,
) => Effect.Effect<
  JobStepResult,
  AppError,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const fqn = yield* Effect.fromResult(
      Result.mapError(parseFqn(op.args.name), fqnInvalidErrorToAppError),
    );

    const extensionDir = path.join(
      ws.baseDir,
      REGISTRY_EXTENSIONS_DIR,
      fqn.owner,
      HOOK_EXTENSION_DIR,
      fqn.name,
    );
    const extensionDirExists = yield* fs
      .exists(extensionDir)
      .pipe(Effect.orElseSucceed(() => false));
    if (!extensionDirExists) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Managed hook not found: ${extensionDir}`,
      });
    }

    const manifestPath = path.join(extensionDir, HOOK_MANIFEST_FILENAME);
    const manifestContent = yield* fs.readFileString(manifestPath).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          detail: `Failed to read manifest: ${manifestPath}`,
          cause,
        }),
      ),
    );
    const manifestJson = yield* Effect.try({
      try: (): unknown => JSON.parse(manifestContent),
      catch: (cause) =>
        makeAppError({
          code: "validation",
          detail: `Invalid JSON in manifest: ${manifestPath}`,
          cause,
        }),
    });
    const manifest: HookManifest = yield* Schema.decodeUnknownEffect(HookManifestSchema)(
      manifestJson,
    ).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `Invalid manifest schema: ${manifestPath}`,
          cause,
        }),
      ),
    );

    yield* runPublishLintGate({
      type: "hook",
      extensionDir,
      manifestJson,
      platform: { fs, path },
    });

    const archive = yield* buildZipArchive(
      extensionDir,
      yield* publishArchiveOptions("hook", manifest.publish?.ignore),
    );
    const integrity = yield* computeIntegrity(archive);
    const registrySource = yield* ws.getConfiguredSourceByName(op.args.registryName).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          detail: `Failed to lookup registry source "${op.args.registryName}"`,
          cause,
        }),
      ),
    );

    if (Option.isNone(registrySource) || registrySource.value.type !== "registry") {
      return yield* makeAppError({
        code: "not_found",
        detail: `Registry source "${op.args.registryName}" not found or not a registry source`,
      });
    }

    const client = yield* createRegistryClient(registrySource.value.location.href);
    const metadata: VersionEntry = {
      version: manifest.version,
      published: yield* DateTime.now,
      integrity,
      ...(manifest.packages !== undefined ? { packages: manifest.packages } : {}),
    };
    const response = yield* client.publishExtension({
      owner: fqn.owner,
      type: "hook",
      name: fqn.name,
      version: manifest.version,
      archive,
      metadata,
    });

    return {
      result: "success",
      message: `Published ${op.args.name}@${manifest.version}`,
      ...(response.links !== undefined ? { links: response.links } : {}),
    } satisfies JobStepResult;
  });

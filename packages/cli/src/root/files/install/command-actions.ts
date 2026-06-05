import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import { FilesManager, type FilesExtensionRef } from "@agentxm/client-core/unstable/files";
import {
  buildInstallOperation,
  parseRegistrySourcePatternParts,
  REGISTRY_EXTENSIONS_DIR,
  type Handle,
} from "@agentxm/client-core/unstable/extensions";
import type { FilesLockEntry } from "@agentxm/client-core/unstable/lockfile";
import type {
  JobStepArtifact,
  JobStepArtifactTarget,
  Plan,
} from "@agentxm/client-core/unstable/plan";
import {
  resolveSource,
  SourceHostProviders,
} from "@agentxm/client-core/unstable/source-resolution";
import type { Source } from "@agentxm/client-core/unstable/sources";
import type { VersionRange } from "@agentxm/client-core/unstable/version-constraints";
import type { InstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { InstallFilesCommandIntent } from "./intent.js";

export interface InstallFilesHandlerArgs {
  readonly source: string;
}

export interface ParsedFilesInstallArgs {
  readonly source: Source;
  readonly names: ReadonlyArray<string>;
  readonly owner: Option.Option<Handle>;
  readonly versionRange: Option.Option<VersionRange>;
}

export type FilesInstallSourceRequest = ParsedFilesInstallArgs;

const filesLockEntryVersion = (entry: FilesLockEntry): string | undefined =>
  entry.type === "registry" ? entry.resolvedVersion : undefined;

const filesInstallArtifactPath = (entry: FilesLockEntry): string => {
  if (entry.type === "registry") {
    return `${REGISTRY_EXTENSIONS_DIR}/${entry.owner}/files/${entry.name}`;
  }
  if (entry.type === "local") {
    return entry.path;
  }
  return entry.path === undefined ? ".axm/extensions" : entry.path;
};

const filesInstallArtifactTargets = (args: {
  readonly lockEntry: FilesLockEntry;
  readonly installedBefore: boolean;
}): ReadonlyArray<JobStepArtifactTarget> =>
  [...(args.lockEntry.materializedTargets ?? [])]
    .sort((left, right) => left.target.localeCompare(right.target))
    .map((target) => ({
      path: target.target,
      change: args.installedBefore ? "unchanged" : "created",
    }));

const filesInstallArtifact = (args: {
  readonly lockEntry: FilesLockEntry;
  readonly installedBefore: boolean;
  readonly scope: JobStepArtifact["scope"];
}): JobStepArtifact => {
  const targets = filesInstallArtifactTargets(args);
  const version = filesLockEntryVersion(args.lockEntry);

  return {
    path: filesInstallArtifactPath(args.lockEntry),
    scope: args.scope,
    ...(version === undefined ? {} : { version }),
    change: args.installedBefore ? "updated" : "created",
    ...(targets.length === 0 ? {} : { fileCount: targets.length, targets }),
  };
};

export class InstallFilesCommandWorkflowActions extends ServiceMap.Service<
  InstallFilesCommandWorkflowActions,
  InstallExtensionCommandWorkflowActions<
    InstallFilesHandlerArgs,
    ParsedFilesInstallArgs,
    FilesInstallSourceRequest,
    FilesExtensionRef,
    InstallFilesCommandIntent
  >
>()("axm.sh/root/files/install/command-actions/InstallFilesCommandWorkflowActions") {}

export const InstallFilesCommandWorkflowActionsLive = Layer.effect(
  InstallFilesCommandWorkflowActions,
  Effect.gen(function* () {
    const sources = yield* SourceHostProviders;
    const ws = yield* WorkspaceMutations;
    const filesManager = yield* FilesManager;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const envLayer = Layer.mergeAll(
      Layer.succeed(SourceHostProviders, sources),
      Layer.succeed(WorkspaceMutations, ws),
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );
    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, envLayer);

    const parseArgs = (
      args: InstallFilesHandlerArgs,
    ): Effect.Effect<ParsedFilesInstallArgs, AppError> =>
      provide(
        Effect.gen(function* () {
          const input = args.source.trim();
          const parsed = parseRegistrySourcePatternParts(input);
          const source = yield* resolveSource(input).pipe(
            Effect.mapError((error) =>
              makeAppError({
                code: "validation",
                detail: `Invalid files source: ${error.message}`,
                cause: error,
              }),
            ),
          );

          const names = parsed?.type === "files" && parsed.name !== undefined ? [parsed.name] : [];

          return {
            source,
            names,
            owner:
              parsed?.type === "files"
                ? Option.some(parsed.owner)
                : source.type === "registry"
                  ? source.owner
                  : Option.none<Handle>(),
            versionRange:
              source.type === "registry" && parsed?.type === "files"
                ? Option.fromUndefinedOr(parsed.versionRange)
                : Option.none<VersionRange>(),
          };
        }),
      );

    const resolveSourceRequests = (parsed: ParsedFilesInstallArgs) => Effect.succeed([parsed]);

    const discoverRefs = (reqs: ReadonlyArray<FilesInstallSourceRequest>) =>
      Effect.scoped(
        Effect.gen(function* () {
          const discovered = yield* Effect.forEach(
            reqs,
            (req) =>
              sources
                .find(req.source, {
                  names: req.names,
                  type: "files",
                  owner: req.owner,
                  versionRange: req.versionRange,
                })
                .pipe(
                  Effect.map((refs) =>
                    refs.filter((ref): ref is FilesExtensionRef => ref.type === "files"),
                  ),
                ),
            { concurrency: "unbounded" },
          );
          return discovered.flat();
        }),
      );

    const finalizeIntent = (
      parsed: ParsedFilesInstallArgs,
      refs: ReadonlyArray<FilesExtensionRef>,
    ): Effect.Effect<InstallFilesCommandIntent, AppError> =>
      Effect.gen(function* () {
        if (refs.length === 0) {
          return yield* makeAppError({
            code: "not_found",
            detail: "No files packages found in source",
          });
        }
        return {
          refs: refs.map((ref) => ({
            ref,
            versionRange: ref.refType === "registry" ? parsed.versionRange : Option.none(),
          })),
        };
      });

    const buildPlan = (intent: InstallFilesCommandIntent): Effect.Effect<Plan, AppError> =>
      Effect.succeed({
        _tag: "Plan",
        name: "Install files",
        description: Option.some("Install files package"),
        jobs: [
          {
            concurrency: 1,
            steps: intent.refs.map(({ ref, versionRange }) =>
              buildInstallOperation(filesManager, {
                ref,
                versionRange,
                installedBefore: filesManager.isInstalled({
                  target: { type: "files", name: ref.file.name },
                }),
                message: `Installed ${ref.file.name}`,
                buildArtifact: ({ installedBefore }) =>
                  Effect.gen(function* () {
                    const currentLockEntry = yield* ws.getLockedFilesEntry(ref.file.name);
                    if (Option.isNone(currentLockEntry)) {
                      return yield* makeAppError({
                        code: "internal",
                        detail: `Installed files package ${ref.file.name} but could not read its lockfile entry`,
                        suggestions: [{ description: "Inspect .axm/axm-lock.yaml." }],
                      });
                    }
                    return filesInstallArtifact({
                      lockEntry: currentLockEntry.value,
                      installedBefore,
                      scope: ws.scope,
                    });
                  }),
              }),
            ),
          },
        ],
      } satisfies Plan);

    return {
      parseArgs,
      resolveSourceRequests,
      discoverRefs,
      finalizeIntent,
      buildPlan,
    };
  }),
);

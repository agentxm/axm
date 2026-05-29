import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import { DocsManager, type DocsExtensionRef } from "@agentxm/client-core/unstable/docs";
import {
  buildInstallOperation,
  parseRegistrySourcePatternParts,
  type Handle,
} from "@agentxm/client-core/unstable/extensions";
import type { Plan } from "@agentxm/client-core/unstable/plan";
import {
  resolveSource,
  SourceHostProviders,
} from "@agentxm/client-core/unstable/source-resolution";
import type { Source } from "@agentxm/client-core/unstable/sources";
import type { VersionRange } from "@agentxm/client-core/unstable/version-constraints";
import type { InstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { InstallDocsCommandIntent } from "./intent.js";

export interface InstallDocsHandlerArgs {
  readonly source: string;
}

export interface ParsedDocsInstallArgs {
  readonly source: Source;
  readonly names: ReadonlyArray<string>;
  readonly owner: Option.Option<Handle>;
  readonly versionRange: Option.Option<VersionRange>;
}

export type DocsInstallSourceRequest = ParsedDocsInstallArgs;

export class InstallDocsCommandWorkflowActions extends ServiceMap.Service<
  InstallDocsCommandWorkflowActions,
  InstallExtensionCommandWorkflowActions<
    InstallDocsHandlerArgs,
    ParsedDocsInstallArgs,
    DocsInstallSourceRequest,
    DocsExtensionRef,
    InstallDocsCommandIntent
  >
>()("axm.sh/root/docs/install/command-actions/InstallDocsCommandWorkflowActions") {}

export const InstallDocsCommandWorkflowActionsLive = Layer.effect(
  InstallDocsCommandWorkflowActions,
  Effect.gen(function* () {
    const sources = yield* SourceHostProviders;
    const ws = yield* WorkspaceMutations;
    const docsManager = yield* DocsManager;
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
      args: InstallDocsHandlerArgs,
    ): Effect.Effect<ParsedDocsInstallArgs, AppError> =>
      provide(
        Effect.gen(function* () {
          const input = args.source.trim();
          const parsed = parseRegistrySourcePatternParts(input);
          const source = yield* resolveSource(input).pipe(
            Effect.mapError((error) =>
              makeAppError({
                code: "validation",
                detail: `Invalid docs source: ${error.message}`,
                cause: error,
              }),
            ),
          );

          const names = parsed?.type === "docs" && parsed.name !== undefined ? [parsed.name] : [];

          return {
            source,
            names,
            owner:
              parsed?.type === "docs"
                ? Option.some(parsed.owner)
                : source.type === "registry"
                  ? source.owner
                  : Option.none<Handle>(),
            versionRange:
              source.type === "registry" && parsed?.type === "docs"
                ? Option.fromUndefinedOr(parsed.versionRange)
                : Option.none<VersionRange>(),
          };
        }),
      );

    const resolveSourceRequests = (parsed: ParsedDocsInstallArgs) => Effect.succeed([parsed]);

    const discoverRefs = (reqs: ReadonlyArray<DocsInstallSourceRequest>) =>
      Effect.scoped(
        Effect.gen(function* () {
          const discovered = yield* Effect.forEach(
            reqs,
            (req) =>
              sources
                .find(req.source, {
                  names: req.names,
                  type: "docs",
                  owner: req.owner,
                  versionRange: req.versionRange,
                })
                .pipe(
                  Effect.map((refs) =>
                    refs.filter((ref): ref is DocsExtensionRef => ref.type === "docs"),
                  ),
                ),
            { concurrency: "unbounded" },
          );
          return discovered.flat();
        }),
      );

    const finalizeIntent = (
      parsed: ParsedDocsInstallArgs,
      refs: ReadonlyArray<DocsExtensionRef>,
    ): Effect.Effect<InstallDocsCommandIntent, AppError> =>
      Effect.gen(function* () {
        if (refs.length === 0) {
          return yield* makeAppError({
            code: "not_found",
            detail: "No docs packages found in source",
          });
        }
        return {
          refs: refs.map((ref) => ({
            ref,
            versionRange: ref.refType === "registry" ? parsed.versionRange : Option.none(),
          })),
        };
      });

    const buildPlan = (intent: InstallDocsCommandIntent): Effect.Effect<Plan, AppError> =>
      Effect.succeed({
        _tag: "Plan",
        name: "Install docs",
        description: Option.some("Install docs package"),
        jobs: [
          {
            concurrency: 1,
            steps: intent.refs.map(({ ref, versionRange }) =>
              buildInstallOperation(docsManager, { ref, versionRange }),
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

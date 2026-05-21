import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import { ContextManager, type ContextExtensionRef } from "@agentxm/client-core/unstable/context";
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
import type { InstallContextCommandIntent } from "./intent.js";

export interface InstallContextHandlerArgs {
  readonly source: string;
}

export interface ParsedContextInstallArgs {
  readonly source: Source;
  readonly names: ReadonlyArray<string>;
  readonly owner: Option.Option<Handle>;
  readonly versionRange: Option.Option<VersionRange>;
}

export type ContextInstallSourceRequest = ParsedContextInstallArgs;

export class InstallContextCommandWorkflowActions extends ServiceMap.Service<
  InstallContextCommandWorkflowActions,
  InstallExtensionCommandWorkflowActions<
    InstallContextHandlerArgs,
    ParsedContextInstallArgs,
    ContextInstallSourceRequest,
    ContextExtensionRef,
    InstallContextCommandIntent
  >
>()("axm.sh/root/context/install/command-actions/InstallContextCommandWorkflowActions") {}

export const InstallContextCommandWorkflowActionsLive = Layer.effect(
  InstallContextCommandWorkflowActions,
  Effect.gen(function* () {
    const sources = yield* SourceHostProviders;
    const ws = yield* WorkspaceMutations;
    const contextManager = yield* ContextManager;
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
      args: InstallContextHandlerArgs,
    ): Effect.Effect<ParsedContextInstallArgs, AppError> =>
      provide(
        Effect.gen(function* () {
          const input = args.source.trim();
          const parsed = parseRegistrySourcePatternParts(input);
          const source = yield* resolveSource(input).pipe(
            Effect.mapError((error) =>
              makeAppError({
                code: "validation",
                detail: `Invalid context source: ${error.message}`,
                cause: error,
              }),
            ),
          );

          const names =
            parsed?.type === "context" && parsed.name !== undefined ? [parsed.name] : [];

          return {
            source,
            names,
            owner:
              parsed?.type === "context"
                ? Option.some(parsed.owner)
                : source.type === "registry"
                  ? source.owner
                  : Option.none<Handle>(),
            versionRange:
              source.type === "registry" && parsed?.type === "context"
                ? Option.fromUndefinedOr(parsed.versionRange)
                : Option.none<VersionRange>(),
          };
        }),
      );

    const resolveSourceRequests = (parsed: ParsedContextInstallArgs) => Effect.succeed([parsed]);

    const discoverRefs = (reqs: ReadonlyArray<ContextInstallSourceRequest>) =>
      Effect.scoped(
        Effect.gen(function* () {
          const discovered = yield* Effect.forEach(
            reqs,
            (req) =>
              sources
                .find(req.source, {
                  names: req.names,
                  type: "context",
                  owner: req.owner,
                  versionRange: req.versionRange,
                })
                .pipe(
                  Effect.map((refs) =>
                    refs.filter((ref): ref is ContextExtensionRef => ref.type === "context"),
                  ),
                ),
            { concurrency: "unbounded" },
          );
          return discovered.flat();
        }),
      );

    const finalizeIntent = (
      parsed: ParsedContextInstallArgs,
      refs: ReadonlyArray<ContextExtensionRef>,
    ): Effect.Effect<InstallContextCommandIntent, AppError> =>
      Effect.gen(function* () {
        if (refs.length === 0) {
          return yield* makeAppError({
            code: "not_found",
            detail: "No context packages found in source",
          });
        }
        return {
          refs: refs.map((ref) => ({
            ref,
            versionRange: ref.refType === "registry" ? parsed.versionRange : Option.none(),
          })),
        };
      });

    const buildPlan = (intent: InstallContextCommandIntent): Effect.Effect<Plan, AppError> =>
      Effect.succeed({
        _tag: "Plan",
        name: "Install context",
        description: Option.some("Install context package"),
        jobs: [
          {
            concurrency: 1,
            steps: intent.refs.map(({ ref, versionRange }) =>
              buildInstallOperation(contextManager, { ref, versionRange }),
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

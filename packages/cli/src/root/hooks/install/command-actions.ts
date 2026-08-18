import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import {
  HOOK_EXTENSION_DIR,
  HookManager,
  type HookExtensionRef,
} from "@agentxm/client-core/unstable/hooks";
import {
  buildInstallOperation,
  parseRegistrySourcePatternParts,
  REGISTRY_EXTENSIONS_DIR,
  type Handle,
} from "@agentxm/client-core/unstable/extensions";
import type { HookLockEntry } from "@agentxm/client-core/unstable/lockfile";
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
import { makeRegistryLoginSuggestionResolver } from "../../shared/registry-login-suggestion.js";
import type { InstallHookCommandIntent } from "./intent.js";

export interface InstallHookHandlerArgs {
  readonly source: string;
}

export interface ParsedHookInstallArgs {
  readonly source: Source;
  readonly names: ReadonlyArray<string>;
  readonly owner: Option.Option<Handle>;
  readonly versionRange: Option.Option<VersionRange>;
}

export type HookInstallSourceRequest = ParsedHookInstallArgs;

const hookLockEntryVersion = (entry: HookLockEntry): string | undefined =>
  entry.type === "registry" ? entry.resolvedVersion : undefined;

const hookInstallArtifactPath = (entry: HookLockEntry): string => {
  if (entry.type === "registry") {
    return `${REGISTRY_EXTENSIONS_DIR}/${entry.owner}/${HOOK_EXTENSION_DIR}/${entry.name}`;
  }
  if (entry.type === "local") {
    return entry.path;
  }
  return "path" in entry && entry.path !== undefined ? entry.path : ".axm/extensions";
};

export const hookInstallArtifact = (args: {
  readonly lockEntry: HookLockEntry;
  readonly installedBefore: boolean;
  readonly scope: JobStepArtifact["scope"];
  readonly agents: ReadonlyArray<string>;
  readonly targets: ReadonlyArray<JobStepArtifactTarget>;
}): JobStepArtifact => {
  const version = hookLockEntryVersion(args.lockEntry);

  return {
    path: hookInstallArtifactPath(args.lockEntry),
    scope: args.scope,
    agents: args.agents,
    ...(version === undefined ? {} : { version }),
    change: args.installedBefore ? "updated" : "created",
    ...(args.targets.length === 0 ? {} : { fileCount: args.targets.length, targets: args.targets }),
  };
};

export class InstallHookCommandWorkflowActions extends ServiceMap.Service<
  InstallHookCommandWorkflowActions,
  InstallExtensionCommandWorkflowActions<
    InstallHookHandlerArgs,
    ParsedHookInstallArgs,
    HookInstallSourceRequest,
    HookExtensionRef,
    InstallHookCommandIntent
  >
>()("axm.sh/root/hooks/install/command-actions/InstallHookCommandWorkflowActions") {}

export const InstallHookCommandWorkflowActionsLive = Layer.effect(
  InstallHookCommandWorkflowActions,
  Effect.gen(function* () {
    const sources = yield* SourceHostProviders;
    const httpClient = yield* HttpClient.HttpClient;
    const ws = yield* WorkspaceMutations;
    const hookManager = yield* HookManager;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const loginSuggestionsFor = yield* makeRegistryLoginSuggestionResolver;

    const envLayer = Layer.mergeAll(
      Layer.succeed(SourceHostProviders, sources),
      Layer.succeed(HttpClient.HttpClient, httpClient),
      Layer.succeed(WorkspaceMutations, ws),
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );
    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, envLayer);

    const parseArgs = (
      args: InstallHookHandlerArgs,
    ): Effect.Effect<ParsedHookInstallArgs, AppError> =>
      provide(
        Effect.gen(function* () {
          const input = args.source.trim();
          const parsed = parseRegistrySourcePatternParts(input);
          const source = yield* resolveSource(input).pipe(
            Effect.mapError((error) =>
              makeAppError({
                code: "validation",
                detail: `Invalid hooks source: ${error.message}`,
                cause: error,
              }),
            ),
          );

          const names = parsed?.type === "hooks" && parsed.name !== undefined ? [parsed.name] : [];

          return {
            source,
            names,
            owner:
              parsed?.type === "hooks"
                ? Option.some(parsed.owner)
                : source.type === "registry"
                  ? source.owner
                  : Option.none<Handle>(),
            versionRange:
              source.type === "registry" && parsed?.type === "hooks"
                ? Option.fromUndefinedOr(parsed.versionRange)
                : Option.none<VersionRange>(),
          };
        }),
      );

    const resolveSourceRequests = (parsed: ParsedHookInstallArgs) => Effect.succeed([parsed]);

    const discoverRefs = (reqs: ReadonlyArray<HookInstallSourceRequest>) =>
      Effect.gen(function* () {
        const discovered = yield* Effect.forEach(
          reqs,
          (req) =>
            sources
              .find(req.source, {
                names: req.names,
                type: "hook",
                owner: req.owner,
                versionRange: req.versionRange,
              })
              .pipe(
                Effect.map((refs) =>
                  refs.filter((ref): ref is HookExtensionRef => ref.type === "hook"),
                ),
              ),
          { concurrency: "unbounded" },
        );
        return discovered.flat();
      });

    const finalizeIntent = (
      parsed: ParsedHookInstallArgs,
      refs: ReadonlyArray<HookExtensionRef>,
    ): Effect.Effect<InstallHookCommandIntent, AppError> =>
      Effect.gen(function* () {
        if (refs.length === 0) {
          const suggestions =
            parsed.source.type === "registry"
              ? yield* loginSuggestionsFor([parsed.source.location.href])
              : [];
          return yield* makeAppError({
            code: "not_found",
            detail: "No hooks packages found in source",
            suggestions,
          });
        }
        return {
          refs: refs.map((ref) => ({
            ref,
            versionRange: ref.refType === "registry" ? parsed.versionRange : Option.none(),
          })),
        };
      });

    const buildPlan = (intent: InstallHookCommandIntent): Effect.Effect<Plan, AppError> =>
      Effect.succeed({
        _tag: "Plan",
        name: "Install hooks",
        description: Option.some("Install hooks package"),
        jobs: [
          {
            concurrency: 1,
            steps: intent.refs.map(({ ref, versionRange }) =>
              buildInstallOperation(hookManager, {
                ref,
                versionRange,
                installedBefore: hookManager.isInstalled({
                  target: { type: "hook", name: ref.hook.name },
                }),
                message: `Installed ${ref.hook.name}`,
                buildArtifact: ({ installedBefore }) =>
                  Effect.gen(function* () {
                    const materialization =
                      hookManager.getLastMaterialization === undefined
                        ? { agents: [], targets: [] }
                        : yield* hookManager.getLastMaterialization({
                            target: { type: "hook", name: ref.hook.name },
                          });
                    const currentLockEntry = yield* ws
                      .getLockedHookEntry(ref.hook.name)
                      .pipe(Effect.catch(() => Effect.succeed(Option.none())));
                    if (Option.isNone(currentLockEntry)) {
                      const path =
                        ref.refType === "registry" || ref.refType === "workspace"
                          ? `${REGISTRY_EXTENSIONS_DIR}/${ref.owner}/${HOOK_EXTENSION_DIR}/${ref.name}`
                          : ref.hook.name;
                      const change = installedBefore ? "updated" : "created";
                      return {
                        path,
                        scope: ws.scope,
                        ...(ref.refType === "registry" || ref.refType === "workspace"
                          ? { version: ref.version }
                          : {}),
                        agents: materialization.agents,
                        change,
                        targets:
                          materialization.targets.length === 0
                            ? [{ path, change }]
                            : materialization.targets.map((target) => ({
                                ...target,
                                change,
                              })),
                      } satisfies JobStepArtifact;
                    }
                    return hookInstallArtifact({
                      lockEntry: currentLockEntry.value,
                      installedBefore,
                      scope: ws.scope,
                      agents: materialization.agents,
                      targets: materialization.targets.map((target) => ({
                        ...target,
                        change: installedBefore ? "updated" : "created",
                      })),
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

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
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
  acquiredExtensionDisplayPath,
  acquiredExtensionDisplayPathFromLockEntry,
  buildInstallOperation,
  parseSourceQualifiedRegistrySourcePatternParts,
  REGISTRY_EXTENSIONS_DIR,
  type Handle,
} from "@agentxm/client-core/unstable/extensions";
import type { HookLockEntry } from "@agentxm/client-core/unstable/lockfile";
import type {
  ConfiguredAgentOutcome,
  JobStepArtifact,
  JobStepArtifactTarget,
  JobStepResult,
  Plan,
  PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { applyPlannedProjections } from "@agentxm/client-core/unstable/projection";
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

type InstallHookActions = InstallExtensionCommandWorkflowActions<
  InstallHookHandlerArgs,
  ParsedHookInstallArgs,
  HookInstallSourceRequest,
  HookExtensionRef,
  InstallHookCommandIntent
>;

const hookLockEntryVersion = (entry: HookLockEntry): string | undefined =>
  entry.type === "registry" ? entry.resolvedVersion : undefined;

const acquiredRoot = (scope: JobStepArtifact["scope"]): string =>
  scope === "project" ? REGISTRY_EXTENSIONS_DIR : ".axm/extensions";

const hookRefArtifactPath = (ref: HookExtensionRef, scope: JobStepArtifact["scope"]): string =>
  ref.refType === "workspace"
    ? ref.location
    : acquiredExtensionDisplayPath(acquiredRoot(scope), ref, HOOK_EXTENSION_DIR, ref.name);

const hookInstallArtifactPath = (entry: HookLockEntry, scope: JobStepArtifact["scope"]): string => {
  return acquiredExtensionDisplayPathFromLockEntry(
    acquiredRoot(scope),
    entry,
    HOOK_EXTENSION_DIR,
    entry.workspaceName,
  );
};

export const hookInstallArtifact = (args: {
  readonly lockEntry: HookLockEntry;
  readonly installedBefore: boolean;
  readonly scope: JobStepArtifact["scope"];
  readonly agents: ReadonlyArray<string>;
  readonly targets: ReadonlyArray<JobStepArtifactTarget>;
  readonly agentOutcomes?: ReadonlyArray<ConfiguredAgentOutcome>;
}): JobStepArtifact => {
  const version = hookLockEntryVersion(args.lockEntry);

  return {
    path: hookInstallArtifactPath(args.lockEntry, args.scope),
    scope: args.scope,
    agents: args.agents,
    ...(version === undefined ? {} : { version }),
    change: args.installedBefore ? "updated" : "created",
    ...(args.agentOutcomes === undefined ? {} : { agentOutcomes: args.agentOutcomes }),
    ...(args.targets.length === 0 ? {} : { fileCount: args.targets.length, targets: args.targets }),
  };
};

export const InstallHookCommandWorkflowActions = Effect.gen(function* () {
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
        const parsed = parseSourceQualifiedRegistrySourcePatternParts(input);
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
    Effect.gen(function* () {
      const deferProjections = intent.deferProjections === true || intent.refs.length > 1;
      const memberSteps = yield* Effect.forEach(
        intent.refs,
        ({ ref, versionRange }): Effect.Effect<PlannedJobStep, AppError> =>
          Effect.gen(function* () {
            const installedBefore = yield* hookManager.isInstalled({
              target: { type: "hook", name: ref.hook.name },
            });
            const agentOutcomes =
              hookManager.configuredAgentOutcomesForRef === undefined
                ? []
                : yield* hookManager.configuredAgentOutcomesForRef(ref, "projected");
            const previewPath = hookRefArtifactPath(ref, ws.scope);
            const previewArtifact = {
              path: previewPath,
              scope: ws.scope,
              agents: agentOutcomes
                .filter(({ outcome }) => outcome !== "blocked")
                .map(({ agentId }) => agentId),
              ...(ref.refType === "registry" || ref.refType === "workspace"
                ? { version: ref.version }
                : {}),
              change: installedBefore ? "updated" : "created",
              agentOutcomes,
              targets: Array.from(
                new Map(
                  agentOutcomes.flatMap((outcome) =>
                    outcome.path === undefined
                      ? []
                      : [
                          [
                            outcome.path,
                            {
                              path: outcome.path,
                              change: installedBefore ? "updated" : "created",
                              agentIds: agentOutcomes
                                .filter(({ path }) => path === outcome.path)
                                .map(({ agentId }) => agentId),
                            },
                          ] as const,
                        ],
                  ),
                ).values(),
              ),
            } satisfies JobStepArtifact;
            const operation = buildInstallOperation(hookManager, {
              ref,
              versionRange,
              skipProjections: deferProjections,
              installedBefore: Effect.succeed(installedBefore),
              message: `Installed ${ref.hook.name}`,
              buildArtifact: ({ installedBefore }) =>
                Effect.gen(function* () {
                  const materialization =
                    hookManager.getLastMaterialization === undefined
                      ? { agents: [], targets: [] }
                      : yield* hookManager.getLastMaterialization({
                          target: { type: "hook", name: ref.hook.name },
                        });
                  const appliedOutcomes =
                    hookManager.configuredAgentOutcomesForRef === undefined
                      ? []
                      : yield* hookManager.configuredAgentOutcomesForRef(ref, "current");
                  const currentLockEntry = yield* ws
                    .getLockedHookEntry(ref.hook.name)
                    .pipe(Effect.catch(() => Effect.succeed(Option.none())));
                  if (Option.isNone(currentLockEntry)) {
                    const path = hookRefArtifactPath(ref, ws.scope);
                    const change = installedBefore ? "updated" : "created";
                    return {
                      path,
                      scope: ws.scope,
                      ...(ref.refType === "registry" || ref.refType === "workspace"
                        ? { version: ref.version }
                        : {}),
                      agents: materialization.agents,
                      change,
                      agentOutcomes: appliedOutcomes,
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
                    agentOutcomes: appliedOutcomes,
                    targets: materialization.targets.map((target) => ({
                      ...target,
                      change: installedBefore ? "updated" : "created",
                    })),
                  });
                }),
            });
            const blocked = agentOutcomes.filter(({ outcome }) => outcome === "blocked");
            if (blocked.length > 0) {
              return {
                ...(operation.key === undefined ? {} : { key: operation.key }),
                label: operation.label,
                readiness: "error",
                errorMessage: blocked
                  .map(({ agentId, reason }) => `${agentId}: ${reason}`)
                  .join("; "),
                artifact: previewArtifact,
              } satisfies PlannedJobStep;
            }
            return { ...operation, artifact: previewArtifact } satisfies PlannedJobStep;
          }),
        { concurrency: 1 },
      );
      const projectionSteps: ReadonlyArray<PlannedJobStep> =
        deferProjections && intent.deferProjections !== true
          ? [
              {
                key: "projection:hook:units",
                label: "hook projections",
                readiness: "ready",
                run: applyPlannedProjections(hookManager).pipe(
                  Effect.as({
                    result: "success",
                    message: "Rendered installed Hooks from the complete contributor set",
                  } satisfies JobStepResult),
                ),
              },
            ]
          : [];
      return {
        _tag: "Plan",
        name: "Install hooks",
        description: Option.some("Install hooks package"),
        jobs: [
          {
            concurrency: 1,
            steps: [...memberSteps, ...projectionSteps],
          },
        ],
      } satisfies Plan;
    });

  return {
    parseArgs,
    resolveSourceRequests,
    discoverRefs,
    finalizeIntent,
    buildPlan,
  };
}).pipe(Effect.map((actions): InstallHookActions => actions));

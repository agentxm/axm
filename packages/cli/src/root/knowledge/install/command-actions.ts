import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as Path from "effect/Path";

import { makeAppError, type AppError } from "@agentxm/extension-management/unstable/app-error";
import {
  extensionRefLifecycleWarnings,
  extensionRefRegistryLifecycle,
  targetFromRef,
  toLabelWithCompanions,
  toStepKey,
} from "@agentxm/extension-management/unstable/extensions";
import {
  parseSourceQualifiedRegistrySourcePatternParts,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import { KnowledgeManager } from "@agentxm/extension-management/unstable/knowledge";
import {
  type KnowledgeExtensionRef,
  WorkspaceMutations,
} from "@agentxm/extension-management/unstable/workspace";
import type {
  JobStepResult,
  Plan,
  PlannedJobStep,
} from "@agentxm/extension-management/unstable/plan";
import { applyPlannedProjections } from "@agentxm/extension-management/unstable/projection";
import {
  resolveSource,
  SourceHostProviders,
} from "@agentxm/extension-management/unstable/source-resolution";
import type { Source } from "@agentxm/extension-model/unstable/sources/types";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import type { InstallExtensionCommandWorkflowActions } from "@agentxm/extension-management/unstable/workflows";
import { makeRegistryLoginSuggestionResolver } from "../../shared/registry-login-suggestion.js";
import type { InstallKnowledgeCommandIntent } from "./intent.js";
import { appErrorToStepFailure } from "@agentxm/extension-management/unstable/app-error/conversions";

export interface InstallKnowledgeHandlerArgs {
  readonly source: string;
}

type KnowledgeInstallActions = InstallExtensionCommandWorkflowActions<
  InstallKnowledgeHandlerArgs,
  ParsedKnowledgeInstallArgs,
  ParsedKnowledgeInstallArgs,
  KnowledgeExtensionRef,
  InstallKnowledgeCommandIntent
>;

interface ParsedKnowledgeInstallArgs {
  readonly source: Source;
  readonly names: ReadonlyArray<string>;
  readonly owner: Option.Option<Handle>;
  readonly versionRange: Option.Option<VersionRange>;
}

export const InstallKnowledgeCommandWorkflowActions = Effect.gen(function* () {
  const sources = yield* SourceHostProviders;
  const httpClient = yield* HttpClient.HttpClient;
  const manager = yield* KnowledgeManager;
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const loginSuggestionsFor = yield* makeRegistryLoginSuggestionResolver;
  const env = Layer.mergeAll(
    Layer.succeed(SourceHostProviders, sources),
    Layer.succeed(HttpClient.HttpClient, httpClient),
    Layer.succeed(WorkspaceMutations, ws),
    Layer.succeed(FileSystem.FileSystem, fs),
    Layer.succeed(Path.Path, path),
  );
  const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, env);

  const parseArgs = (
    args: InstallKnowledgeHandlerArgs,
  ): Effect.Effect<ParsedKnowledgeInstallArgs, AppError> =>
    provide(
      Effect.gen(function* () {
        const input = args.source.trim();
        const parsed = parseSourceQualifiedRegistrySourcePatternParts(input);
        const source = yield* resolveSource(input).pipe(
          Effect.mapError((cause) =>
            makeAppError({
              code: "validation",
              detail: `Invalid knowledge source: ${cause.message}`,
              cause,
            }),
          ),
        );
        return {
          source,
          names: parsed?.type === "knowledge" && parsed.name !== undefined ? [parsed.name] : [],
          owner:
            parsed?.type === "knowledge"
              ? Option.some(parsed.owner)
              : source.type === "registry"
                ? source.owner
                : Option.none<Handle>(),
          versionRange:
            source.type === "registry" && parsed?.type === "knowledge"
              ? Option.fromUndefinedOr(parsed.versionRange)
              : Option.none<VersionRange>(),
        };
      }),
    );

  return {
    parseArgs,
    resolveSourceRequests: (parsed) => Effect.succeed([parsed]),
    discoverRefs: (requests) =>
      Effect.forEach(
        requests,
        (request) =>
          sources
            .find(request.source, {
              names: request.names,
              type: "knowledge",
              owner: request.owner,
              versionRange: request.versionRange,
            })
            .pipe(
              Effect.map((refs) =>
                refs.filter((ref): ref is KnowledgeExtensionRef => ref.type === "knowledge"),
              ),
            ),
        { concurrency: "unbounded" },
      ).pipe(Effect.map((groups) => groups.flat())),
    finalizeIntent: (parsed, refs) =>
      Effect.gen(function* () {
        if (refs.length === 0) {
          const suggestions =
            parsed.source.type === "registry"
              ? yield* loginSuggestionsFor([parsed.source.location.href])
              : [];
          return yield* makeAppError({
            code: "not_found",
            detail: "No knowledge bundles found in source",
            suggestions,
          });
        }
        return {
          refs: refs.map((ref) => ({
            ref,
            versionRange: ref.refType === "registry" ? parsed.versionRange : Option.none(),
          })),
        };
      }),
    buildPlan: (intent) => {
      const deferProjections = intent.deferProjections === true || intent.refs.length > 1;
      const memberSteps = intent.refs.map(({ ref, versionRange }) =>
        (() => {
          const target = targetFromRef(ref);
          const packages = ref.refType === "registry" ? ref.packages : [];
          const base = {
            key: toStepKey(target),
            label: toLabelWithCompanions(target, packages),
            run: manager.install({ ref, versionRange, deferProjection: deferProjections }).pipe(
              Effect.mapError(appErrorToStepFailure),
              Effect.as({
                result: "success" as const,
                message: `Installed ${ref.knowledge.name}`,
              }),
            ),
          };
          const warnings = extensionRefLifecycleWarnings(ref);
          const registryLifecycle = extensionRefRegistryLifecycle(ref);
          return warnings.length === 0
            ? {
                ...base,
                readiness: "ready" as const,
                ...(registryLifecycle === undefined ? {} : { registryLifecycle }),
              }
            : {
                ...base,
                readiness: "warn" as const,
                warnMessage: warnings.join("; "),
                ...(registryLifecycle === undefined ? {} : { registryLifecycle }),
              };
        })(),
      );
      const projectionSteps: ReadonlyArray<PlannedJobStep> =
        deferProjections && intent.deferProjections !== true
          ? [
              {
                key: "projection:knowledge:discovery-region",
                label: "knowledge projection",
                readiness: "ready",
                run: applyPlannedProjections(manager).pipe(
                  Effect.mapError(appErrorToStepFailure),
                  Effect.as({
                    result: "success",
                    message:
                      "Rendered installed Knowledge bundles from the complete contributor set",
                  } satisfies JobStepResult),
                ),
              },
            ]
          : [];
      return Effect.succeed({
        _tag: "Plan",
        name: "Install knowledge",
        description: Option.some("Install Open Knowledge Format bundle"),
        jobs: [
          {
            concurrency: 1,
            steps: [...memberSteps, ...projectionSteps],
          },
        ],
      } satisfies Plan);
    },
  } satisfies KnowledgeInstallActions;
}).pipe(Effect.map((actions): KnowledgeInstallActions => actions));

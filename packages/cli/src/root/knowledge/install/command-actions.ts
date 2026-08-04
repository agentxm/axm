import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import {
  parseRegistrySourcePatternParts,
  targetFromRef,
  toLabelWithCompanions,
  toStepKey,
  type Handle,
} from "@agentxm/client-core/unstable/extensions";
import {
  KnowledgeManager,
  type KnowledgeExtensionRef,
} from "@agentxm/client-core/unstable/knowledge";
import type { Plan } from "@agentxm/client-core/unstable/plan";
import {
  resolveSource,
  SourceHostProviders,
} from "@agentxm/client-core/unstable/source-resolution";
import type { Source } from "@agentxm/client-core/unstable/sources";
import type { VersionRange } from "@agentxm/client-core/unstable/version-constraints";
import type { InstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { InstallKnowledgeCommandIntent } from "./intent.js";

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

export class InstallKnowledgeCommandWorkflowActions extends ServiceMap.Service<
  InstallKnowledgeCommandWorkflowActions,
  KnowledgeInstallActions
>()("axm.sh/root/knowledge/install/command-actions/InstallKnowledgeCommandWorkflowActions") {}

const makeInstallKnowledgeCommandWorkflowActions = Effect.gen(function* () {
  const sources = yield* SourceHostProviders;
  const manager = yield* KnowledgeManager;
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const env = Layer.mergeAll(
    Layer.succeed(SourceHostProviders, sources),
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
        const parsed = parseRegistrySourcePatternParts(input);
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
      refs.length === 0
        ? Effect.fail(
            makeAppError({ code: "not_found", detail: "No knowledge bundles found in source" }),
          )
        : Effect.succeed({
            refs: refs.map((ref) => ({
              ref,
              versionRange: ref.refType === "registry" ? parsed.versionRange : Option.none(),
            })),
          }),
    buildPlan: (intent) =>
      Effect.succeed({
        _tag: "Plan",
        name: "Install knowledge",
        description: Option.some("Install Open Knowledge Format bundle"),
        jobs: [
          {
            concurrency: 1,
            steps: intent.refs.map(({ ref, versionRange }) =>
              (() => {
                const target = targetFromRef(ref);
                const packages = ref.refType === "registry" ? ref.packages : [];
                const base = {
                  key: toStepKey(target),
                  label: toLabelWithCompanions(target, packages),
                  run: manager.install({ ref, versionRange }).pipe(
                    Effect.as({
                      result: "success" as const,
                      message: `Installed ${ref.knowledge.name}`,
                    }),
                  ),
                };
                const warnings = ref.refType === "registry" ? (ref.lifecycleWarnings ?? []) : [];
                return warnings.length === 0
                  ? { ...base, readiness: "ready" as const }
                  : {
                      ...base,
                      readiness: "warn" as const,
                      warnMessage: warnings.join("; "),
                    };
              })(),
            ),
          },
        ],
      } satisfies Plan),
  } satisfies KnowledgeInstallActions;
});

export const InstallKnowledgeCommandWorkflowActionsLive = Layer.effect(
  InstallKnowledgeCommandWorkflowActions,
  makeInstallKnowledgeCommandWorkflowActions,
);

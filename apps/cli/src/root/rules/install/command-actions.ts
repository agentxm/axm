import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { makeAppError, type AppError } from "../../../app-error/index.js";
import { toAppError } from "../../../app-error/conversions.js";
import { buildInstallOperation } from "@agentxm/extension-workspace";
import {
  parseSourceQualifiedRegistrySourcePatternParts,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import type {
  JobStepArtifact,
  JobStepResult,
  Plan,
  PlannedJobStep,
} from "@agentxm/workspace-operations";
import { applyPlannedProjections, RuleManager } from "@agentxm/extension-workspace";
import { type RuleExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/rule";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { resolveSource, SourceHostProviders, WorkspaceCatalog } from "@agentxm/extension-sources";
import type { Source } from "@agentxm/extension-model/unstable/sources/types";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import type { InstallExtensionCommandWorkflowActions } from "@agentxm/extension-lifecycle";
import { makeRegistryLoginSuggestionResolver } from "../../shared/registry-login-suggestion.js";
import type { InstallRuleCommandIntent } from "./intent.js";
import { failureToStepFailure } from "../../../app-error/conversions.js";
import type { PromptCancelled } from "../../../prompt/prompt-cancelled.js";

export interface InstallRuleHandlerArgs {
  readonly source: string;
}

export interface ParsedRuleInstallArgs {
  readonly source: Source;
  readonly names: ReadonlyArray<string>;
  readonly owner: Option.Option<Handle>;
  readonly versionRange: Option.Option<VersionRange>;
}

export type RuleInstallSourceRequest = ParsedRuleInstallArgs;

type InstallRuleActions = InstallExtensionCommandWorkflowActions<
  InstallRuleHandlerArgs,
  ParsedRuleInstallArgs,
  RuleInstallSourceRequest,
  RuleExtensionRef,
  InstallRuleCommandIntent,
  AppError,
  AppError | PromptCancelled
>;

export const InstallRuleCommandWorkflowActions = Effect.gen(function* () {
  const sources = yield* SourceHostProviders;
  const catalog = yield* WorkspaceCatalog;
  const httpClient = yield* HttpClient.HttpClient;
  const ws = yield* WorkspaceMutations;
  const ruleManager = yield* RuleManager;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const loginSuggestionsFor = yield* makeRegistryLoginSuggestionResolver;

  const envLayer = Layer.mergeAll(
    Layer.succeed(SourceHostProviders, sources),
    Layer.succeed(WorkspaceCatalog, catalog),
    Layer.succeed(HttpClient.HttpClient, httpClient),
    Layer.succeed(WorkspaceMutations, ws),
    Layer.succeed(FileSystem.FileSystem, fs),
    Layer.succeed(Path.Path, path),
  );
  const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, envLayer);

  const parseArgs = (
    args: InstallRuleHandlerArgs,
  ): Effect.Effect<ParsedRuleInstallArgs, AppError> =>
    provide(
      Effect.gen(function* () {
        const input = args.source.trim();
        const parsed = parseSourceQualifiedRegistrySourcePatternParts(input);
        const source = yield* resolveSource(input).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "validation",
              detail: `Invalid rule source: ${error.message}`,
              cause: error,
            }),
          ),
        );

        const names = parsed?.type === "rules" && parsed.name !== undefined ? [parsed.name] : [];

        return {
          source,
          names,
          owner:
            parsed?.type === "rules"
              ? Option.some(parsed.owner)
              : source.type === "registry"
                ? source.owner
                : Option.none<Handle>(),
          versionRange:
            source.type === "registry" && parsed?.type === "rules"
              ? Option.fromUndefinedOr(parsed.versionRange)
              : Option.none<VersionRange>(),
        };
      }),
    );

  const resolveSourceRequests = (parsed: ParsedRuleInstallArgs) => Effect.succeed([parsed]);

  const discoverRefs = (reqs: ReadonlyArray<RuleInstallSourceRequest>) =>
    Effect.gen(function* () {
      const discovered = yield* Effect.forEach(
        reqs,
        (req) =>
          sources
            .find(req.source, {
              names: req.names,
              type: "rule",
              owner: req.owner,
              versionRange: req.versionRange,
            })
            .pipe(
              Effect.mapError(toAppError),
              Effect.map((refs) =>
                refs.filter((ref): ref is RuleExtensionRef => ref.type === "rule"),
              ),
            ),
        { concurrency: "unbounded" },
      );
      return discovered.flat();
    });

  const finalizeIntent = (
    parsed: ParsedRuleInstallArgs,
    refs: ReadonlyArray<RuleExtensionRef>,
  ): Effect.Effect<InstallRuleCommandIntent, AppError> =>
    Effect.gen(function* () {
      if (refs.length === 0) {
        const suggestions =
          parsed.source.type === "registry"
            ? yield* loginSuggestionsFor([parsed.source.location.href])
            : [];
        return yield* makeAppError({
          code: "not_found",
          detail: "No rules found in source",
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

  const buildPlan = (intent: InstallRuleCommandIntent): Effect.Effect<Plan, AppError> => {
    const deferProjections = intent.deferProjections === true || intent.refs.length > 1;
    const memberSteps = intent.refs.map(({ ref, versionRange }) =>
      buildInstallOperation(ruleManager, {
        toStepFailure: failureToStepFailure,
        ref,
        versionRange,
        skipProjections: deferProjections,
        installedBefore: ruleManager.isInstalled({
          target: { type: "rule", name: ref.rule.name },
        }),
        buildArtifact: ({ installedBefore }) =>
          Effect.gen(function* () {
            const materialization =
              ruleManager.getLastMaterialization === undefined
                ? { agents: [], targets: [] }
                : yield* ruleManager.getLastMaterialization({
                    target: { type: "rule", name: ref.rule.name },
                  });
            const change: JobStepArtifact["change"] = installedBefore ? "updated" : "created";
            const targets = materialization.targets.map((target) => ({
              path: target.path,
              change,
              ...(target.agentIds === undefined ? {} : { agentIds: target.agentIds }),
            }));
            return {
              path: targets[0]?.path ?? ref.rule.name,
              scope: ws.scope,
              agents: materialization.agents,
              ...(ref.refType === "registry" ? { version: ref.version } : {}),
              change,
              ...(targets.length === 0 ? {} : { fileCount: targets.length, targets }),
            } satisfies JobStepArtifact;
          }),
      }),
    );
    const projectionSteps: ReadonlyArray<PlannedJobStep> =
      deferProjections && intent.deferProjections !== true
        ? [
            {
              key: "projection:rule:instructions-region",
              label: "rule projections",
              readiness: "ready",
              run: applyPlannedProjections(ruleManager).pipe(
                Effect.mapError(failureToStepFailure),
                Effect.as({
                  result: "success",
                  message: "Rendered installed Rules from the complete contributor set",
                } satisfies JobStepResult),
              ),
            },
          ]
        : [];
    return Effect.succeed({
      _tag: "Plan",
      name: "Install rules",
      description: Option.some("Install rule"),
      jobs: [
        {
          concurrency: 1,
          steps: [...memberSteps, ...projectionSteps],
        },
      ],
    } satisfies Plan);
  };

  return {
    parseArgs,
    resolveSourceRequests,
    discoverRefs,
    finalizeIntent,
    buildPlan,
  };
}).pipe(Effect.map((actions): InstallRuleActions => actions));

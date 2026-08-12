import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import {
  buildInstallOperation,
  parseRegistrySourcePatternParts,
  type Handle,
} from "@agentxm/client-core/unstable/extensions";
import type { JobStepArtifact, Plan } from "@agentxm/client-core/unstable/plan";
import { RuleManager, type RuleExtensionRef } from "@agentxm/client-core/unstable/rules";
import {
  resolveSource,
  SourceHostProviders,
} from "@agentxm/client-core/unstable/source-resolution";
import type { Source } from "@agentxm/client-core/unstable/sources";
import type { VersionRange } from "@agentxm/client-core/unstable/version-constraints";
import type { InstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { InstallRuleCommandIntent } from "./intent.js";

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

export class InstallRuleCommandWorkflowActions extends ServiceMap.Service<
  InstallRuleCommandWorkflowActions,
  InstallExtensionCommandWorkflowActions<
    InstallRuleHandlerArgs,
    ParsedRuleInstallArgs,
    RuleInstallSourceRequest,
    RuleExtensionRef,
    InstallRuleCommandIntent
  >
>()("axm.sh/root/rules/install/command-actions/InstallRuleCommandWorkflowActions") {}

export const InstallRuleCommandWorkflowActionsLive = Layer.effect(
  InstallRuleCommandWorkflowActions,
  Effect.gen(function* () {
    const sources = yield* SourceHostProviders;
    const ws = yield* WorkspaceMutations;
    const ruleManager = yield* RuleManager;
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
      args: InstallRuleHandlerArgs,
    ): Effect.Effect<ParsedRuleInstallArgs, AppError> =>
      provide(
        Effect.gen(function* () {
          const input = args.source.trim();
          const parsed = parseRegistrySourcePatternParts(input);
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
          return yield* makeAppError({
            code: "not_found",
            detail: "No rules found in source",
          });
        }
        return {
          refs: refs.map((ref) => ({
            ref,
            versionRange: ref.refType === "registry" ? parsed.versionRange : Option.none(),
          })),
        };
      });

    const buildPlan = (intent: InstallRuleCommandIntent): Effect.Effect<Plan, AppError> =>
      Effect.succeed({
        _tag: "Plan",
        name: "Install rules",
        description: Option.some("Install rule"),
        jobs: [
          {
            concurrency: 1,
            steps: intent.refs.map(({ ref, versionRange }) =>
              buildInstallOperation(ruleManager, {
                ref,
                versionRange,
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
                    const change: JobStepArtifact["change"] = installedBefore
                      ? "updated"
                      : "created";
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

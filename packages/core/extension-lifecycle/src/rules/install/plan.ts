/**
 * Installing rules.
 *
 * The source grammar a rule request accepts, the discovery that turns it into
 * refs, and the closure each ref becomes — including who renders the shared
 * instructions region when more than one rule lands in the same operation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { RuleManager } from "@agentxm/extension-materialization";
import { buildInstallOperation } from "@agentxm/workspace-reconciliation";
import {
  parseSourceQualifiedRegistrySourcePatternParts,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import type { RuleExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/rule";
import type { Source } from "@agentxm/extension-model/unstable/sources/types";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import { SourceHostProviders, resolveSource } from "@agentxm/extension-sources";
import {
  operationPresentation,
  type JobStepArtifact,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import { applyPlannedProjections } from "@agentxm/workspace-projection";
import { WorkspaceMutations } from "@agentxm/workspace-state";

import type { ExtensionLifecycleFailed } from "../../errors.js";
import { lifecycleStepFailure } from "../../step-failure.js";
import { registryLoginSuggestions } from "../../install/registry-login-suggestion.js";
import {
  installRefused,
  type InstallStepRequirements,
  type ResolveInstallRequirements,
  type RuleInstallIntent,
} from "../../install/vocabulary.js";

/** A rule source after grammar parsing, before anything is discovered. */
export interface ParsedRuleInstallRequest {
  readonly source: Source;
  readonly names: ReadonlyArray<string>;
  readonly owner: Option.Option<Handle>;
  readonly versionRange: Option.Option<VersionRange>;
}

/** Read the rule source grammar: which owner, which names, which range. */
export const parseRuleInstallRequest: (
  source: string,
) => Effect.Effect<ParsedRuleInstallRequest, ExtensionLifecycleFailed, ResolveInstallRequirements> =
  Effect.fn("InstallExtensions.parseRuleRequest")(function* (source: string) {
    const input = source.trim();
    const parsed = parseSourceQualifiedRegistrySourcePatternParts(input);
    const resolved = yield* resolveSource(input).pipe(
      Effect.mapError((error) =>
        installRefused({
          category: "validation",
          detail: `Invalid rule source: ${error.message}`,
          cause: error,
        }),
      ),
    );

    return {
      source: resolved,
      names: parsed?.type === "rules" && parsed.name !== undefined ? [parsed.name] : [],
      owner:
        parsed?.type === "rules"
          ? Option.some(parsed.owner)
          : resolved.type === "registry"
            ? resolved.owner
            : Option.none<Handle>(),
      versionRange:
        resolved.type === "registry" && parsed?.type === "rules"
          ? Option.fromUndefinedOr(parsed.versionRange)
          : Option.none<VersionRange>(),
    };
  });

/** Discover the rules the parsed source offers. */
export const discoverRuleRefs: (
  request: ParsedRuleInstallRequest,
) => Effect.Effect<
  ReadonlyArray<RuleExtensionRef>,
  ExtensionLifecycleFailed,
  ResolveInstallRequirements
> = Effect.fn("InstallExtensions.discoverRules")(function* (request: ParsedRuleInstallRequest) {
  const sources = yield* SourceHostProviders;
  return yield* sources
    .find(request.source, {
      names: request.names,
      type: "rule",
      owner: request.owner,
      versionRange: request.versionRange,
    })
    .pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "network",
          detail: "Rules could not be discovered from the source",
          cause,
        }),
      ),
      Effect.map((refs) => refs.filter((ref): ref is RuleExtensionRef => ref.type === "rule")),
    );
});

/** Settle which rules this request installs, or refuse when none matched. */
export const finalizeRuleInstallIntent: (
  request: ParsedRuleInstallRequest,
  refs: ReadonlyArray<RuleExtensionRef>,
) => Effect.Effect<RuleInstallIntent, ExtensionLifecycleFailed> = Effect.fn(
  "InstallExtensions.finalizeRuleIntent",
)(function* (request: ParsedRuleInstallRequest, refs: ReadonlyArray<RuleExtensionRef>) {
  if (refs.length === 0) {
    const suggestions =
      request.source.type === "registry"
        ? yield* registryLoginSuggestions([request.source.location.href])
        : [];
    return yield* installRefused({
      category: "not_found",
      detail: "No rules found in source",
      suggestions,
    });
  }
  return {
    refs: refs.map((ref) => ({
      ref,
      versionRange: ref.refType === "registry" ? request.versionRange : Option.none(),
    })),
  } satisfies RuleInstallIntent;
});

/** The closures a settled rule intent becomes. */
export const planRuleInstall: (
  intent: RuleInstallIntent,
) => Effect.Effect<
  Plan<InstallStepRequirements>,
  ExtensionLifecycleFailed,
  InstallStepRequirements | RuleManager
> = Effect.fn("InstallExtensions.planRules")(function* (intent: RuleInstallIntent) {
  const ws = yield* WorkspaceMutations;
  const ruleManager = yield* RuleManager;
  // One rule renders the shared instructions region itself; several rules in
  // one operation defer it so the region is rendered once, from the complete
  // contributor set.
  const deferProjections = intent.deferProjections === true || intent.refs.length > 1;
  const memberSteps = intent.refs.map(({ ref, versionRange }) =>
    buildInstallOperation(ruleManager, {
      toStepFailure: lifecycleStepFailure,
      ref,
      declaration: { name: ref.rule.name, versionRange },
      ...(deferProjections
        ? { enclosingClosure: { projections: [ref.type], postconditions: [] } }
        : {}),
      installedBefore: ruleManager.isInstalled({
        target: { type: "rule", name: ref.rule.name },
      }),
      buildArtifact: ({ installedBefore }) =>
        Effect.gen(function* () {
          const materialization = yield* ruleManager.aggregateProjectionObservation;
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
  const projectionSteps: ReadonlyArray<PlannedJobStep<InstallStepRequirements>> =
    deferProjections && intent.deferProjections !== true
      ? [
          {
            key: "projection:rule:instructions-region",
            label: "rule projections",
            readiness: "ready",
            run: applyPlannedProjections(ruleManager).pipe(
              Effect.mapError(lifecycleStepFailure),
              Effect.as({
                result: "success",
                message: "Rendered installed Rules from the complete contributor set",
              } satisfies JobStepResult),
            ),
          },
        ]
      : [];
  return {
    _tag: "Plan",
    name: "Install rules",
    description: Option.some("Install rule"),
    presentation: operationPresentation(
      { imperative: "install", past: "Installed", gerund: "Installing" },
      "rule",
    ),
    jobs: [{ concurrency: 1, steps: [...memberSteps, ...projectionSteps] }],
  } satisfies Plan<InstallStepRequirements>;
});

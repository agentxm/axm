/**
 * Installing Open Knowledge Format bundles.
 *
 * A bundle becomes discoverable through the shared discovery region, so
 * several bundles in one operation defer that render until every contributor
 * has landed.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  KnowledgeManager,
  extensionRefLifecycleWarnings,
  extensionRefRegistryLifecycle,
  targetFromRef,
  toLabelWithCompanions,
  toStepKey,
} from "@agentxm/extension-materialization";
import {
  parseSourceQualifiedRegistrySourcePatternParts,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import type { KnowledgeExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/knowledge";
import type { Source } from "@agentxm/extension-model/unstable/sources/types";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import { SourceHostProviders, resolveSource } from "@agentxm/extension-sources";
import {
  operationPresentation,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import { applyPlannedProjections } from "@agentxm/workspace-projection";

import type { ExtensionLifecycleFailed } from "../../errors.js";
import { lifecycleStepFailure } from "../../step-failure.js";
import { registryLoginSuggestions } from "../../install/registry-login-suggestion.js";
import {
  installRefused,
  type InstallStepRequirements,
  type KnowledgeInstallIntent,
  type ResolveInstallRequirements,
} from "../../install/vocabulary.js";

/** A knowledge source after grammar parsing, before anything is discovered. */
export interface ParsedKnowledgeInstallRequest {
  readonly source: Source;
  readonly names: ReadonlyArray<string>;
  readonly owner: Option.Option<Handle>;
  readonly versionRange: Option.Option<VersionRange>;
}

/** Read the knowledge source grammar: which owner, which names, which range. */
export const parseKnowledgeInstallRequest: (
  source: string,
) => Effect.Effect<
  ParsedKnowledgeInstallRequest,
  ExtensionLifecycleFailed,
  ResolveInstallRequirements
> = Effect.fn("InstallExtensions.parseKnowledgeRequest")(function* (source: string) {
  const input = source.trim();
  const parsed = parseSourceQualifiedRegistrySourcePatternParts(input);
  const resolved = yield* resolveSource(input).pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "validation",
        detail: `Invalid knowledge source: ${cause.message}`,
        cause,
      }),
    ),
  );
  return {
    source: resolved,
    names: parsed?.type === "knowledge" && parsed.name !== undefined ? [parsed.name] : [],
    owner:
      parsed?.type === "knowledge"
        ? Option.some(parsed.owner)
        : resolved.type === "registry"
          ? resolved.owner
          : Option.none<Handle>(),
    versionRange:
      resolved.type === "registry" && parsed?.type === "knowledge"
        ? Option.fromUndefinedOr(parsed.versionRange)
        : Option.none<VersionRange>(),
  };
});

/** Discover the knowledge bundles the parsed source offers. */
export const discoverKnowledgeRefs: (
  request: ParsedKnowledgeInstallRequest,
) => Effect.Effect<
  ReadonlyArray<KnowledgeExtensionRef>,
  ExtensionLifecycleFailed,
  ResolveInstallRequirements
> = Effect.fn("InstallExtensions.discoverKnowledge")(function* (
  request: ParsedKnowledgeInstallRequest,
) {
  const sources = yield* SourceHostProviders;
  return yield* sources
    .find(request.source, {
      names: request.names,
      type: "knowledge",
      owner: request.owner,
      versionRange: request.versionRange,
    })
    .pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "network",
          detail: "Knowledge bundles could not be discovered from the source",
          cause,
        }),
      ),
      Effect.map((refs) =>
        refs.filter((ref): ref is KnowledgeExtensionRef => ref.type === "knowledge"),
      ),
    );
});

/** Settle which knowledge bundles this request installs, or refuse when none matched. */
export const finalizeKnowledgeInstallIntent: (
  request: ParsedKnowledgeInstallRequest,
  refs: ReadonlyArray<KnowledgeExtensionRef>,
) => Effect.Effect<KnowledgeInstallIntent, ExtensionLifecycleFailed> = Effect.fn(
  "InstallExtensions.finalizeKnowledgeIntent",
)(function* (request: ParsedKnowledgeInstallRequest, refs: ReadonlyArray<KnowledgeExtensionRef>) {
  if (refs.length === 0) {
    const suggestions =
      request.source.type === "registry"
        ? yield* registryLoginSuggestions([request.source.location.href])
        : [];
    return yield* installRefused({
      category: "not_found",
      detail: "No knowledge bundles found in source",
      suggestions,
    });
  }
  return {
    refs: refs.map((ref) => ({
      ref,
      versionRange: ref.refType === "registry" ? request.versionRange : Option.none(),
    })),
  } satisfies KnowledgeInstallIntent;
});

/** The closures a settled knowledge intent becomes. */
export const planKnowledgeInstall: (
  intent: KnowledgeInstallIntent,
) => Effect.Effect<
  Plan<InstallStepRequirements>,
  ExtensionLifecycleFailed,
  InstallStepRequirements | KnowledgeManager
> = Effect.fn("InstallExtensions.planKnowledge")(function* (intent: KnowledgeInstallIntent) {
  const manager = yield* KnowledgeManager;
  const deferProjections = intent.deferProjections === true || intent.refs.length > 1;
  const memberSteps = intent.refs.map(
    ({ ref, versionRange }): PlannedJobStep<InstallStepRequirements> => {
      const target = targetFromRef(ref);
      const packages = ref.refType === "registry" ? ref.packages : [];
      const base = {
        key: toStepKey(target),
        label: toLabelWithCompanions(target, packages),
        run: manager.install({ ref, versionRange, deferProjection: deferProjections }).pipe(
          Effect.mapError(lifecycleStepFailure),
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
    },
  );
  const projectionSteps: ReadonlyArray<PlannedJobStep<InstallStepRequirements>> =
    deferProjections && intent.deferProjections !== true
      ? [
          {
            key: "projection:knowledge:discovery-region",
            label: "knowledge projection",
            readiness: "ready",
            run: applyPlannedProjections(manager).pipe(
              Effect.mapError(lifecycleStepFailure),
              Effect.as({
                result: "success",
                message: "Rendered installed Knowledge bundles from the complete contributor set",
              } satisfies JobStepResult),
            ),
          },
        ]
      : [];
  return {
    _tag: "Plan",
    name: "Install knowledge",
    description: Option.some("Install Open Knowledge Format bundle"),
    presentation: operationPresentation(
      { imperative: "install", past: "Installed", gerund: "Installing" },
      "knowledge",
    ),
    jobs: [{ concurrency: 1, steps: [...memberSteps, ...projectionSteps] }],
  } satisfies Plan<InstallStepRequirements>;
});

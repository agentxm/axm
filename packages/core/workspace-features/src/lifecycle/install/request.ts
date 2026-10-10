/** Parse, discover, and settle source-backed install requests once. */

import * as Effect from "effect/Effect";
import {
  findRetainedSourceComponents,
  retainedSelectionSatisfied,
  mergeRetainedSourceRefs,
} from "./retained-source-components.js";
import * as Option from "effect/Option";
import type * as Config from "effect/Config";
import * as DateTime from "effect/DateTime";
import {
  extensionTypeToPlural,
  parseSourceQualifiedRegistrySourcePatternParts,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { parseInputPattern } from "@agentxm/extension-model/unstable/sources/parser";
import type { Source } from "@agentxm/extension-model/unstable/sources/types";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import {
  SourceHostProviders,
  registryLoginSuggestions,
  sourceResolutionFailureCategory,
  resolveSource,
  type RegistryLookupProbe,
  type SourceResolutionFailure,
} from "@agentxm/workspace-kernel/sources";
import {
  type ExtensionLifecycleFailed,
  installRefused,
} from "@agentxm/workspace-kernel/operations";
import { resolveInstallSource, type LocatorInstallType } from "./source-routing.js";
import {
  sourceResolutionFailureDetail,
  sourceResolutionRefused,
  type ResolvedInstallRef,
  type ResolveInstallRequirements,
} from "@agentxm/workspace-kernel/reconciliation";
import {
  makeConfiguredReleaseAgeEvaluation,
  settleRegistryResolution,
  normalizeReleaseAgeRecords,
  ExtensionResolutionFailed,
} from "@agentxm/workspace-kernel/resolution";

export type SourceInstallType = "hook" | "rule" | "knowledge" | "skill" | "subagent";
export type SourceInstallRef<T extends SourceInstallType> = Extract<
  ExtensionRef,
  { readonly type: T }
>;

export interface ParsedInstallRequest {
  readonly source: Source;
  readonly names: ReadonlyArray<string>;
  readonly owner: Option.Option<Handle>;
  readonly versionRange: Option.Option<VersionRange>;
  readonly resolutionProbes: ReadonlyArray<RegistryLookupProbe>;
}

/** Resolve named Registry installs under the same policy as configured entries. */
export const resolveRegistryInstallRefs = <T extends InstallableExtensionType>(
  type: T,
  request: ParsedInstallRequest,
  names: ReadonlyArray<string>,
  selectionRange: Option.Option<string> = request.versionRange,
) =>
  Effect.gen(function* () {
    const source = request.source;
    if (source.type !== "registry" || Option.isNone(request.owner)) {
      return yield* installRefused({
        category: "validation",
        detail: "Named Registry installs require an owner",
      });
    }
    const owner = request.owner.value;
    const providers = yield* SourceHostProviders;
    const evaluation = yield* makeConfiguredReleaseAgeEvaluation();
    const refs = yield* Effect.forEach(names, (name) =>
      providers
        .resolveNamedRegistry(source, {
          name,
          type,
          owner,
          versionRange: selectionRange,
          releaseAgeEvaluation: evaluation,
        })
        .pipe(
          Effect.catch((cause) =>
            Effect.gen(function* () {
              if (cause._tag === "ConfigError") return yield* Effect.fail(cause);
              const suggestions =
                sourceResolutionFailureCategory(cause) === "not_found"
                  ? yield* registryLoginSuggestions([source.location.href])
                  : [];
              return yield* sourceResolutionRefused(cause, suggestions);
            }),
          ),
          Effect.flatMap((resolution) =>
            Effect.gen(function* () {
              const login =
                resolution.kind === "not_found"
                  ? yield* registryLoginSuggestions([source.location.href])
                  : [];
              return yield* settleRegistryResolution({
                ...resolution,
                versionRange: request.versionRange,
              }).pipe(
                Effect.mapError((cause) =>
                  login.length === 0
                    ? cause
                    : new ExtensionResolutionFailed({
                        ...cause,
                        suggestions: [...(cause.suggestions ?? []), ...login],
                      }),
                ),
              );
            }),
          ),
          Effect.flatMap((entry) => {
            const ref = entry.ref;
            const matches = (
              value: ExtensionRef,
            ): value is Extract<ExtensionRef, { readonly type: T }> => value.type === type;
            return matches(ref)
              ? Effect.succeed({ ...entry, ref })
              : Effect.fail(
                  installRefused({
                    category: "internal",
                    detail: `Registry returned ${ref.type} for a ${type} request`,
                  }),
                );
          }),
        ),
    );
    return {
      refs,
      evaluation,
      releaseAge: {
        evaluatedAt: DateTime.formatIso(evaluation.evaluatedAt),
        holdbacks: normalizeReleaseAgeRecords(
          refs.flatMap((entry) => entry.releaseAge?.holdbacks ?? []),
        ),
        bypasses: normalizeReleaseAgeRecords(
          refs.flatMap((entry) => entry.releaseAge?.bypasses ?? []),
        ),
      },
    };
  });

const MESSAGES: Record<
  SourceInstallType,
  {
    readonly invalidSource: string;
    readonly notFound: string;
    readonly howToFix: (source: Source) => string;
    readonly discoverFailure?: (source: Source, cause: SourceResolutionFailure) => string;
  }
> = {
  hook: {
    invalidSource: "Invalid hooks source",
    notFound: "No hook extensions found in source",
    howToFix: () => "Verify the source contains hook extensions",
  },
  rule: {
    invalidSource: "Invalid rule source",
    notFound: "No rules found in source",
    howToFix: () => "Verify the source contains rules",
  },
  knowledge: {
    invalidSource: "Invalid knowledge source",
    notFound: "No knowledge bundles found in source",
    howToFix: () => "Verify the source contains knowledge bundles",
  },
  skill: {
    invalidSource: "Invalid source",
    notFound: "No skills found in source",
    howToFix: (source) =>
      source.type === "registry"
        ? "Verify the owner and skill name exist in the configured registry"
        : source.type === "local"
          ? "Verify the source path contains directories with SKILL.md files"
          : "Verify the source contains skill directories with SKILL.md files",
  },
  subagent: {
    invalidSource: "Invalid source",
    notFound: "No subagents found in source",
    howToFix: (source) =>
      source.type === "registry"
        ? "Verify the owner and subagent name exist in the configured registry."
        : source.type === "local"
          ? "Verify the source path contains subagent packages with subagent.json and its referenced files."
          : "Verify the source contains subagent packages with subagent.json and its referenced files.",
    discoverFailure: (source, cause) =>
      source.type === "registry"
        ? sourceResolutionFailureDetail(cause).includes("not implemented")
          ? "Remote registry discovery is not yet supported for HTTP(S) sources. Use a file:// registry source, or install from github:owner/repo."
          : "Verify the configured registry is reachable and contains the requested owner/subagent."
        : source.type === "local"
          ? "Verify the source path contains subagent packages with subagent.json and its referenced files."
          : "Verify the source is reachable and contains valid subagent directories.",
  },
};

const REGISTRY_ONLY_NAMES: Record<SourceInstallType, boolean> = {
  hook: false,
  rule: false,
  knowledge: false,
  skill: true,
  subagent: true,
};

export const parseRegistryQualifiedInstallRequest = (
  type: "hook" | "rule" | "knowledge",
  source: string,
): Effect.Effect<ParsedInstallRequest, ExtensionLifecycleFailed, ResolveInstallRequirements> =>
  Effect.gen(function* () {
    const input = source.trim();
    const parsed = parseSourceQualifiedRegistrySourcePatternParts(input);
    const resolved = yield* resolveSource(input).pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "validation",
          detail: `${MESSAGES[type].invalidSource}: ${cause.message}`,
          cause,
        }),
      ),
    );
    const matching = parsed?.type === extensionTypeToPlural[type] ? parsed : undefined;
    return {
      source: resolved,
      names: matching?.name === undefined ? [] : [matching.name],
      owner:
        matching === undefined
          ? resolved.type === "registry"
            ? resolved.owner
            : Option.none<Handle>()
          : Option.some(matching.owner),
      versionRange:
        resolved.type === "registry" && matching !== undefined
          ? Option.fromUndefinedOr(matching.versionRange)
          : Option.none<VersionRange>(),
      resolutionProbes: [],
    } satisfies ParsedInstallRequest;
  }).pipe(Effect.withSpan("InstallExtensions.parseRequest", { attributes: { type } }));

export const parseLocatorInstallRequest = (
  type: LocatorInstallType,
  args: { readonly source: string; readonly names: ReadonlyArray<string> },
): Effect.Effect<
  ParsedInstallRequest,
  ExtensionLifecycleFailed | Config.ConfigError,
  ResolveInstallRequirements
> =>
  Effect.gen(function* () {
    const parsedOption = parseInputPattern(args.source.trim());
    if (Option.isNone(parsedOption)) {
      return yield* installRefused({
        category: "validation",
        detail: "Invalid source: Unable to parse source",
        recover:
          "Valid formats: local path, github:owner/repo, gitlab:owner/repo, or https://example.com",
      });
    }
    const parsed = parsedOption.value;
    const resolutionProbes: Array<RegistryLookupProbe> = [];
    const source = yield* resolveInstallSource(type, parsed, {
      onRegistryProbe: (probe) => {
        resolutionProbes.push(probe);
      },
    }).pipe(
      Effect.mapError((cause) =>
        cause._tag === "ExtensionLifecycleFailed" || cause._tag === "ConfigError"
          ? cause
          : sourceResolutionRefused(cause),
      ),
    );
    const names =
      args.names.length > 0
        ? args.names
        : parsed.pattern.pattern === "name-input"
          ? [parsed.pattern.name]
          : parsed.pattern.pattern === "registry-pattern-input" &&
              Option.isSome(parsed.pattern.name)
            ? [parsed.pattern.name.value]
            : [];
    const owner =
      parsed.pattern.pattern === "registry-pattern-input"
        ? Option.some(parsed.pattern.owner)
        : source.type === "registry"
          ? source.owner
          : Option.none<Handle>();
    return {
      source,
      names,
      owner,
      versionRange:
        parsed.pattern.pattern === "registry-pattern-input"
          ? parsed.pattern.versionRange
          : Option.none<VersionRange>(),
      resolutionProbes,
    } satisfies ParsedInstallRequest;
  }).pipe(Effect.withSpan("InstallExtensions.parseRequest", { attributes: { type } }));

export const discoverInstallRefs = <T extends SourceInstallType>(
  type: T,
  request: ParsedInstallRequest,
): Effect.Effect<
  ReadonlyArray<SourceInstallRef<T>>,
  ExtensionLifecycleFailed | Config.ConfigError,
  ResolveInstallRequirements
> =>
  Effect.gen(function* () {
    const sources = yield* SourceHostProviders;
    const retained: ReadonlyArray<ExtensionRef> = (yield* findRetainedSourceComponents(
      request.source,
      type,
    )).filter((ref) => ref.type === type);
    if (retainedSelectionSatisfied(retained, request.names))
      return retained.filter((ref): ref is SourceInstallRef<T> => ref.type === type);
    const fresh = yield* sources
      .find(request.source, {
        names: REGISTRY_ONLY_NAMES[type] && request.source.type !== "registry" ? [] : request.names,
        type,
        owner: request.owner,
        versionRange: request.versionRange,
      })
      .pipe(
        Effect.mapError((cause) => {
          if (cause._tag === "ConfigError") return cause;
          const hint = MESSAGES[type].discoverFailure?.(request.source, cause);
          return sourceResolutionRefused(cause, hint === undefined ? [] : [{ description: hint }]);
        }),
      );
    const discovered = mergeRetainedSourceRefs(retained, fresh);
    const refs = discovered.filter((ref): ref is SourceInstallRef<T> => ref.type === type);
    if (refs.length === 0) {
      const login =
        request.source.type === "registry"
          ? yield* registryLoginSuggestions([request.source.location.href])
          : [];
      return yield* installRefused({
        category: "not_found",
        detail: MESSAGES[type].notFound,
        suggestions: [...login, { description: MESSAGES[type].howToFix(request.source) }],
      });
    }
    return refs;
  }).pipe(Effect.withSpan("InstallExtensions.discoverRefs", { attributes: { type } }));

export const finalizeInstallRefs = <TRef extends SourceInstallRef<SourceInstallType>>(
  request: ParsedInstallRequest,
  refs: ReadonlyArray<TRef>,
): ReadonlyArray<ResolvedInstallRef<TRef>> =>
  refs.map((ref) => ({
    ref,
    versionRange: ref.refType === "registry" ? request.versionRange : Option.none<VersionRange>(),
  }));

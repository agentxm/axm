/**
 * Configured-entry resolution: the requested source of every configured
 * extension resolved to one accepted ref under the minimum-release-age
 * policy, with the holdback and bypass evidence the operation records.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as FileSystem from "effect/FileSystem";
import type * as Config from "effect/Config";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import type * as Path from "effect/Path";
import type * as Scope from "effect/Scope";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";

import {
  extensionTypeSentenceLabels,
  parseSourceQualifiedRegistrySourcePatternParts,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { ReleaseAgeEvaluation } from "@agentxm/extension-model/unstable/extensions/release-age";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import { resolveSource, SourceHostProviders, WorkspaceCatalog } from "./sources/index.js";
import type { SourceResolutionFailure } from "./sources/index.js";
import {
  acceptedResolutionRef,
  DesiredStateReader,
  LockfileReader,
  resolveWorkspaceExtensionRef,
  SettingsReader,
  WorkspaceLocation,
} from "../desired-state/index.js";
import type { AcceptedCanonicalRefError } from "../desired-state/index.js";

import type { ConfiguredRegistryResolution, ResolvedConfiguredEntry } from "./configured-entry.js";
import { ExtensionResolutionFailed } from "./errors.js";
import { parseMinimumReleaseAge, releaseAgeRecords } from "./release-age-policy.js";
import { ReleaseAgePosture } from "./release-age-posture.js";

export const makeConfiguredReleaseAgeEvaluation = () =>
  Effect.gen(function* () {
    const mode = yield* ReleaseAgePosture;
    const settings = yield* SettingsReader;
    const minimumReleaseAge = yield* parseMinimumReleaseAge(yield* settings.minimumReleaseAge);
    const evaluatedAt = yield* DateTime.now;
    const exclude = yield* settings.minimumReleaseAgeExclude;
    return {
      minimumReleaseAge,
      evaluatedAt,
      mode,
      exclude,
    } satisfies ReleaseAgeEvaluation;
  });

type ConfiguredRegistryRef = Extract<
  ConfiguredRegistryResolution,
  { readonly kind: "selected" | "exempted" }
>["ref"];

const resolveConfiguredWorkspaceRef = (name: string, source: string, expectedType: ExtensionType) =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const layout = yield* Ref.get(location.layout);
    return yield* resolveWorkspaceExtensionRef({
      settingsName: name,
      source,
      expectedType,
      layout,
      scope: location.scope,
    });
  });

const configuredRegistryResolution = (resolution: ConfiguredRegistryResolution) =>
  Effect.gen(function* () {
    if (resolution.kind === "not_found") {
      return yield* new ExtensionResolutionFailed({
        category: "not_found",
        detail: `Configured extension "${resolution.target}" could not be found in its source`,
        suggestions: [{ description: "Verify the configured source or update axm.json." }],
      });
    }
    if (resolution.kind === "version_unsatisfied") {
      return yield* new ExtensionResolutionFailed({
        category: "conflict",
        title: "No compatible version",
        detail: `${resolution.target} has no visible version satisfying ${resolution.requestedRange}`,
      });
    }
    if (resolution.kind === "policy_held") {
      return yield* new ExtensionResolutionFailed({
        category: "conflict",
        title: "Release held by minimum release age",
        detail: `${resolution.target}@${resolution.candidate.version} is held by the minimum release age until ${resolution.candidate.eligibleAt}`,
        // Both routes are reachable from wherever the operator is standing:
        // the exemption is declared once, the flag lasts one run.
        recover: `Declare ${resolution.target} in minimumReleaseAgeExclude, or rerun this command with --ignore-release-age to take it for this run only.`,
      });
    }

    const { holdbacks, bypasses } = releaseAgeRecords(
      {
        target: resolution.target,
        requestedRange: Option.getOrUndefined(resolution.versionRange),
      },
      resolution,
      resolution.ref.version,
    );
    return {
      ref: resolution.ref,
      versionRange: resolution.versionRange,
      ...(holdbacks.length === 0 && bypasses.length === 0
        ? {}
        : { releaseAge: { holdbacks, bypasses } }),
    };
  });

const prepareConfiguredRegistryRef = (
  name: string,
  source: string,
  expectedType: ExtensionType,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  selectionRange: Option.Option<VersionRange> | undefined,
) =>
  prepareConfiguredRegistryEntry(
    name,
    source,
    expectedType,
    releaseAgeEvaluation,
    selectionRange,
  ).pipe(
    Effect.map((resolve) =>
      resolve.pipe(
        Effect.flatMap(
          Option.match({
            onNone: () =>
              Effect.succeed(Option.none<ResolvedConfiguredEntry<ConfiguredRegistryRef>>()),
            onSome: (resolution) =>
              configuredRegistryResolution(resolution).pipe(Effect.map(Option.some)),
          }),
        ),
      ),
    ),
  );

/**
 * Finish workspace I/O before starting sibling Registry selections.
 *
 * `selectionRange` is the desired-state graph's effective constraint for the
 * entry: the Registry selects within it, while the returned `versionRange`
 * stays the range the entry itself declares, because that is the intent a
 * planner records. Omitted, the declared range is the selection range.
 */
export const prepareConfiguredRegistryEntry = (
  name: string,
  source: string,
  expectedType: ExtensionType,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  selectionRange?: Option.Option<VersionRange>,
): Effect.Effect<
  Effect.Effect<
    Option.Option<ConfiguredRegistryResolution>,
    SourceResolutionFailure,
    SourceHostProviders | Scope.Scope
  >,
  ExtensionResolutionFailed | AcceptedCanonicalRefError | Config.ConfigError,
  | WorkspaceCatalog
  | WorkspaceLocation
  | SettingsReader
  | LockfileReader
  | DesiredStateReader
  | FileSystem.FileSystem
  | HttpClient.HttpClient
  | Path.Path
> =>
  Effect.gen(function* () {
    if (isWorkspaceSourceLocator(source)) return Effect.succeed(Option.none());

    const resolvedSource = yield* resolveSource(source, { expectedType }).pipe(
      Effect.mapError((failure) =>
        failure._tag === "ConfigError"
          ? failure
          : new ExtensionResolutionFailed({
              category: "validation",
              detail: `Invalid ${expectedType} source for ${name}: ${failure.detail}`,
              cause: failure,
            }),
      ),
    );
    if (resolvedSource.type !== "registry") return Effect.succeed(Option.none());

    const parsedPattern = parseSourceQualifiedRegistrySourcePatternParts(source);
    const pluralType = parsedPattern?.type;
    const expectedPlural = toExtensionTypePlural(expectedType);
    if (pluralType !== undefined && pluralType !== expectedPlural) {
      return yield* new ExtensionResolutionFailed({
        category: "validation",
        detail: `Configured ${expectedType} "${name}" uses a ${pluralType} Registry source`,
      });
    }
    if (
      expectedType !== "mcp-server" &&
      parsedPattern?.name !== undefined &&
      parsedPattern.name !== name
    ) {
      return yield* new ExtensionResolutionFailed({
        category: "validation",
        detail: `Configured ${expectedType} "${name}" points to Registry extension "${parsedPattern.name}"`,
      });
    }
    const owner = parsedPattern?.owner ?? Option.getOrUndefined(resolvedSource.owner);
    if (owner === undefined) {
      return yield* new ExtensionResolutionFailed({
        category: "validation",
        detail: `Configured Registry source for ${expectedType} "${name}" must include an owner`,
      });
    }
    const versionRange = Option.fromUndefinedOr(parsedPattern?.versionRange);
    const registryName = expectedType === "mcp-server" ? (parsedPattern?.name ?? name) : name;
    const acceptedRef = yield* acceptedResolutionRef({
      type: expectedType,
      name,
    });
    const accepted = Option.flatMap(acceptedRef, (ref) =>
      ref.refType === "registry" && ref.owner === owner && ref.name === registryName
        ? Option.some({
            version: ref.version,
            publisherBindingId: ref.publisherBindingId,
          })
        : Option.none(),
    );
    return Effect.gen(function* () {
      const providers = yield* SourceHostProviders;
      const resolution = yield* providers.resolveNamedRegistry(resolvedSource, {
        name: registryName,
        type: expectedType,
        owner,
        versionRange: selectionRange ?? versionRange,
        releaseAgeEvaluation,
        ...(Option.isSome(accepted) ? { accepted: accepted.value } : {}),
      });
      const acceptedVersion =
        Option.isSome(accepted) &&
        (resolution.kind === "selected" || resolution.kind === "exempted") &&
        resolution.ref.version === accepted.value.version &&
        resolution.ref.publisherBindingId === accepted.value.publisherBindingId
          ? accepted.value.version
          : undefined;
      return Option.some({
        ...resolution,
        versionRange,
        ...(acceptedVersion === undefined ? {} : { acceptedVersion }),
      });
    });
  });

type ConfiguredRefFor<TType extends ExtensionType> = Extract<
  ExtensionRef,
  { readonly type: TType }
>;

interface ConfiguredRefConstructor<TType extends ExtensionType> {
  readonly type: TType;
  readonly isRef: (ref: ExtensionRef) => ref is ConfiguredRefFor<TType>;
  readonly name: (ref: ConfiguredRefFor<TType>) => string;
}

const skillRefConstructor: ConfiguredRefConstructor<"skill"> = {
  type: "skill",
  isRef: (ref): ref is ConfiguredRefFor<"skill"> => ref.type === "skill",
  name: (ref) => ref.skill.name,
};

const mcpServerRefConstructor: ConfiguredRefConstructor<"mcp-server"> = {
  type: "mcp-server",
  isRef: (ref): ref is ConfiguredRefFor<"mcp-server"> => ref.type === "mcp-server",
  name: (ref) => ref.server.name,
};

const subagentRefConstructor: ConfiguredRefConstructor<"subagent"> = {
  type: "subagent",
  isRef: (ref): ref is ConfiguredRefFor<"subagent"> => ref.type === "subagent",
  name: (ref) => ref.subagent.name,
};

const ruleRefConstructor: ConfiguredRefConstructor<"rule"> = {
  type: "rule",
  isRef: (ref): ref is ConfiguredRefFor<"rule"> => ref.type === "rule",
  name: (ref) => ref.rule.name,
};

const hookRefConstructor: ConfiguredRefConstructor<"hook"> = {
  type: "hook",
  isRef: (ref): ref is ConfiguredRefFor<"hook"> => ref.type === "hook",
  name: (ref) => ref.hook.name,
};

const knowledgeRefConstructor: ConfiguredRefConstructor<"knowledge"> = {
  type: "knowledge",
  isRef: (ref): ref is ConfiguredRefFor<"knowledge"> => ref.type === "knowledge",
  name: (ref) => ref.knowledge.name,
};

const packRefConstructor: ConfiguredRefConstructor<"pack"> = {
  type: "pack",
  isRef: (ref): ref is ConfiguredRefFor<"pack"> => ref.type === "pack",
  name: (ref) => ref.pack.name,
};

const prepareConfiguredEntry = <TType extends ExtensionType>(
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  refConstructor: ConfiguredRefConstructor<TType>,
  selectionRange?: Option.Option<VersionRange>,
) =>
  Effect.gen(function* () {
    const expectedType = refConstructor.type;
    const typeLabel = extensionTypeSentenceLabels[expectedType];

    if (isWorkspaceSourceLocator(source)) {
      const ref = yield* resolveConfiguredWorkspaceRef(name, source, expectedType);
      if (!refConstructor.isRef(ref)) {
        return yield* new ExtensionResolutionFailed({
          category: "internal",
          detail: `Workspace ${typeLabel} resolution returned ${ref.type}`,
        });
      }
      return Effect.succeed({ ref, versionRange: Option.none<VersionRange>() });
    }

    const resolveRegistry = yield* prepareConfiguredRegistryRef(
      name,
      source,
      expectedType,
      releaseAgeEvaluation,
      selectionRange,
    );
    return Effect.gen(function* () {
      const registry = yield* resolveRegistry;
      if (Option.isSome(registry)) {
        const ref = registry.value.ref;
        if (!refConstructor.isRef(ref)) {
          return yield* new ExtensionResolutionFailed({
            category: "internal",
            detail: `Registry returned a non-${typeLabel}`,
          });
        }
        return { ...registry.value, ref };
      }

      const providers = yield* SourceHostProviders;
      const resolvedSource = yield* resolveSource(source, { expectedType }).pipe(
        Effect.mapError((cause) =>
          cause._tag === "ConfigError"
            ? cause
            : new ExtensionResolutionFailed({
                category: "validation",
                detail: `Invalid ${typeLabel} source for ${name}: ${cause.detail}`,
                cause,
              }),
        ),
      );

      const parsedPattern = parseSourceQualifiedRegistrySourcePatternParts(source);
      const expectedPlural = toExtensionTypePlural(expectedType);
      const requestedOwner =
        parsedPattern?.type === expectedPlural
          ? Option.some(parsedPattern.owner)
          : resolvedSource.type === "registry"
            ? resolvedSource.owner
            : Option.none();
      const versionRange =
        resolvedSource.type === "registry" && parsedPattern?.type === expectedPlural
          ? Option.fromUndefinedOr(parsedPattern.versionRange)
          : Option.none<VersionRange>();
      const refs = yield* providers
        .find(resolvedSource, {
          names: [name],
          type: expectedType,
          owner: requestedOwner,
          versionRange,
        })
        .pipe(
          Effect.map((entries) => entries.filter(refConstructor.isRef)),
          Effect.mapError((cause) =>
            cause._tag === "ConfigError"
              ? cause
              : new ExtensionResolutionFailed({
                  category: "internal",
                  detail: `Failed to resolve configured ${typeLabel} "${name}"`,
                  ...(expectedType === "knowledge"
                    ? {}
                    : {
                        suggestions: [
                          {
                            description: `Verify the configured source is reachable and still contains the ${typeLabel}.`,
                          },
                        ],
                      }),
                  cause,
                }),
          ),
        );

      const ref = refs.find((entry) => refConstructor.name(entry) === name);
      if (ref === undefined) {
        return yield* new ExtensionResolutionFailed({
          category: "not_found",
          detail: `Configured ${typeLabel} "${name}" could not be found in its source`,
          ...(expectedType === "knowledge"
            ? {}
            : {
                suggestions: [
                  {
                    description: `Verify the configured source still contains the ${typeLabel} or update axm.json.`,
                  },
                ],
              }),
        });
      }

      return {
        ref,
        versionRange: ref.refType === "registry" ? versionRange : Option.none(),
      };
    });
  });

const resolveConfiguredEntry = <TType extends ExtensionType>(
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  refConstructor: ConfiguredRefConstructor<TType>,
  selectionRange?: Option.Option<VersionRange>,
) =>
  prepareConfiguredEntry(name, source, releaseAgeEvaluation, refConstructor, selectionRange).pipe(
    Effect.flatten,
  );

export const prepareConfiguredPack = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
) => prepareConfiguredEntry(name, source, releaseAgeEvaluation, packRefConstructor);

export const resolveConfiguredSkill = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  selectionRange?: Option.Option<VersionRange>,
) =>
  resolveConfiguredEntry(name, source, releaseAgeEvaluation, skillRefConstructor, selectionRange);

export const resolveConfiguredMcpServer = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  selectionRange?: Option.Option<VersionRange>,
) =>
  resolveConfiguredEntry(
    name,
    source,
    releaseAgeEvaluation,
    mcpServerRefConstructor,
    selectionRange,
  );

export const resolveConfiguredSubagent = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  selectionRange?: Option.Option<VersionRange>,
) =>
  resolveConfiguredEntry(
    name,
    source,
    releaseAgeEvaluation,
    subagentRefConstructor,
    selectionRange,
  );

export const resolveConfiguredRule = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  selectionRange?: Option.Option<VersionRange>,
) => resolveConfiguredEntry(name, source, releaseAgeEvaluation, ruleRefConstructor, selectionRange);

export const resolveConfiguredHook = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  selectionRange?: Option.Option<VersionRange>,
) => resolveConfiguredEntry(name, source, releaseAgeEvaluation, hookRefConstructor, selectionRange);

export const resolveConfiguredKnowledge = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
  selectionRange?: Option.Option<VersionRange>,
) =>
  resolveConfiguredEntry(
    name,
    source,
    releaseAgeEvaluation,
    knowledgeRefConstructor,
    selectionRange,
  );

export const resolveConfiguredPack = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
) => resolveConfiguredEntry(name, source, releaseAgeEvaluation, packRefConstructor);

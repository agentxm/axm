/**
 * Settings reader: the selected scope's desired-state document and the
 * settings-derived facts commands consult — merged registries, owner,
 * publication default, release-age policy, configured agents, instruction
 * and Knowledge discovery configuration, and the per-type entry maps.
 *
 * Persistence is supplied through the workspace's document operations; this
 * reader owns precedence, defaults, and the shared source cache.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";

import type { ExtensionVisibility } from "@agentxm/extension-model/unstable/extensions/common";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { ScopedReleaseAgeExcludePattern } from "@agentxm/extension-model/unstable/extensions/release-age";
import {
  resolveKnowledgeDiscoveryConfig,
  type ResolvedKnowledgeDiscoveryConfig,
} from "../knowledge/discovery-config.js";
import { DEFAULT_MINIMUM_RELEASE_AGE } from "../settings/index.js";
import type {
  InstructionsConfigValue,
  MinimumReleaseAge,
  Settings,
  SourceHostConfig,
} from "../settings/index.js";
import { settingsEntries, type SettingsEntriesOf } from "./entry-accessors.js";
import { WorkspaceDocuments, type WorkspaceDocumentsService } from "./documents.js";
import { WorkspaceLocation, type WorkspaceLocationService } from "./location.js";
import type { WorkspaceSettingsReadFailure } from "./contracts.js";
import { WorkspaceStateShared } from "./shared.js";

type Read<A> = Effect.Effect<A, WorkspaceSettingsReadFailure>;

/** A configured Registry host. */
export type RegistrySourceHost = Extract<SourceHostConfig, { readonly type: "registry" }>;

/** A Registry locator bound to the configured source that serves it. */
export interface BoundRegistrySource {
  /** The source the locator spells, or the effective default Registry when it spells none. */
  readonly sourceName: string;
  /** The configured Registry host of that name, when one is configured. */
  readonly host: Option.Option<RegistrySourceHost>;
}

/**
 * Bind a Registry locator's source: the one place an unqualified `@owner/...`
 * locator is assigned to the effective default Registry. Every consumer that
 * needs to know which configured Registry a locator names goes through here
 * (directly with the effective default in hand, or through
 * `SettingsReader.bindRegistrySource`).
 */
export const bindRegistrySource = (
  sourceName: Option.Option<string>,
  defaultRegistry: string,
): string => Option.getOrElse(sourceName, () => defaultRegistry);

export interface SettingsReaderService {
  /** The selected scope's settings, defaulting when the file is absent. */
  readonly settings: Read<Settings>;
  /** Merged sources from project, user-scope, and built-in defaults. Cached per workspace lifetime. */
  readonly configuredSources: Read<ReadonlyArray<SourceHostConfig>>;
  readonly sourceByName: (name: string) => Read<Option.Option<SourceHostConfig>>;
  readonly registrySourceHosts: Read<
    ReadonlyArray<Extract<SourceHostConfig, { type: "registry" }>>
  >;
  /** defaultRegistry: project settings, then user-scope settings, then agentxm. */
  readonly defaultRegistry: Read<string>;
  /**
   * The configured Registry a parsed locator names: its spelled source, or
   * the effective default Registry when it spells none, with that source's
   * configured host.
   */
  readonly bindRegistrySource: (locator: {
    readonly sourceName: Option.Option<string>;
  }) => Read<BoundRegistrySource>;
  /** Owner: project settings, then user-scope settings, then none. */
  readonly owner: Read<Option.Option<Handle>>;
  /** Repository publication default for this exact workspace scope. */
  readonly publishDefaultVisibility: Read<Option.Option<ExtensionVisibility>>;
  /** minimumReleaseAge: project settings, then user-scope settings, then the default. */
  readonly minimumReleaseAge: Read<MinimumReleaseAge>;
  /** minimumReleaseAgeExclude with the same precedence; an explicit [] wins. */
  readonly minimumReleaseAgeExclude: Read<ReadonlyArray<ScopedReleaseAgeExcludePattern>>;
  readonly configuredAgents: Read<ReadonlyArray<string>>;
  readonly instructionsConfig: Read<Option.Option<InstructionsConfigValue>>;
  readonly knowledgeDiscoveryConfig: Read<ResolvedKnowledgeDiscoveryConfig>;
  /** The configured entries of one type, defaulting to `{}`. */
  readonly entries: <T extends InstallableExtensionType>(type: T) => Read<SettingsEntriesOf<T>>;
}

export class SettingsReader extends ServiceMap.Service<SettingsReader, SettingsReaderService>()(
  "@agentxm/workspace/desired-state/SettingsReader",
) {}

/**
 * Three-layer merge: project sources, then user-scope sources, then built-in
 * sources. Name-based deduplication: earlier layers win.
 */
const mergeSources = (
  projectSources: ReadonlyArray<SourceHostConfig>,
  globalSources: ReadonlyArray<SourceHostConfig>,
  builtInSources: ReadonlyArray<SourceHostConfig>,
): ReadonlyArray<SourceHostConfig> => {
  const builtInNames = new Set(builtInSources.map((source) => source.name));
  const filteredProject = projectSources.filter((source) => !builtInNames.has(source.name));
  const projectNames = new Set(filteredProject.map((source) => source.name));
  const filteredGlobal = globalSources.filter(
    (source) => !builtInNames.has(source.name) && !projectNames.has(source.name),
  );
  const projectGlobalNames = new Set([...projectNames, ...filteredGlobal.map((s) => s.name)]);
  return [
    ...filteredProject,
    ...filteredGlobal,
    ...builtInSources.filter((s) => !projectGlobalNames.has(s.name)),
  ];
};

export const makeSettingsReader = (
  location: WorkspaceLocationService,
  documents: WorkspaceDocumentsService,
  sourcesCache: Ref.Ref<Option.Option<ReadonlyArray<SourceHostConfig>>>,
): SettingsReaderService => {
  const settings = documents.settings();
  const userSettings = documents.settings("user");
  const projectSettings = documents.settings("project");

  const configuredSources: Read<ReadonlyArray<SourceHostConfig>> = Effect.gen(function* () {
    const cached = yield* Ref.get(sourcesCache);
    if (Option.isSome(cached)) return cached.value;
    const merged = mergeSources(
      (yield* projectSettings).sources ?? [],
      (yield* userSettings).sources ?? [],
      location.builtInSources,
    );
    yield* Ref.set(sourcesCache, Option.some(merged));
    return merged;
  }).pipe(Effect.withSpan("SettingsReader.configuredSources"));

  const registrySourceHosts: Read<ReadonlyArray<RegistrySourceHost>> = configuredSources.pipe(
    Effect.map((sources) => sources.filter((s): s is RegistrySourceHost => s.type === "registry")),
  );
  const defaultRegistry: Read<string> = Effect.gen(function* () {
    const project = yield* projectSettings;
    if (project.defaultRegistry !== undefined) return project.defaultRegistry;
    const user = yield* userSettings;
    return user.defaultRegistry ?? "agentxm";
  }).pipe(Effect.withSpan("SettingsReader.defaultRegistry"));

  return {
    settings,
    configuredSources,
    sourceByName: (name) =>
      configuredSources.pipe(
        Effect.map((sources) => Option.fromUndefinedOr(sources.find((s) => s.name === name))),
      ),
    registrySourceHosts,
    defaultRegistry,
    bindRegistrySource: (locator) =>
      Effect.gen(function* () {
        const sourceName = bindRegistrySource(locator.sourceName, yield* defaultRegistry);
        const hosts = yield* registrySourceHosts;
        return {
          sourceName,
          host: Option.fromUndefinedOr(hosts.find((host) => host.name === sourceName)),
        };
      }).pipe(Effect.withSpan("SettingsReader.bindRegistrySource")),
    owner: Effect.gen(function* () {
      const project = yield* projectSettings;
      if (project.owner) return Option.some(project.owner);
      const user = yield* userSettings;
      if (user.owner) return Option.some(user.owner);
      return Option.none<Handle>();
    }),
    publishDefaultVisibility: settings.pipe(
      Effect.map((value) => Option.fromUndefinedOr(value.publish?.defaultVisibility)),
    ),
    minimumReleaseAge: Effect.gen(function* () {
      const scoped = yield* settings;
      if (scoped.minimumReleaseAge !== undefined) return scoped.minimumReleaseAge;
      if (location.scope === "project") {
        const user = yield* userSettings;
        if (user.minimumReleaseAge !== undefined) return user.minimumReleaseAge;
      }
      return DEFAULT_MINIMUM_RELEASE_AGE satisfies MinimumReleaseAge;
    }).pipe(Effect.withSpan("SettingsReader.minimumReleaseAge")),
    minimumReleaseAgeExclude: Effect.gen(function* () {
      const scoped = yield* settings;
      if (scoped.minimumReleaseAgeExclude !== undefined) {
        return scoped.minimumReleaseAgeExclude.map((pattern): ScopedReleaseAgeExcludePattern => ({
          pattern,
          scope: location.scope,
        }));
      }
      if (location.scope === "project") {
        const user = yield* userSettings;
        if (user.minimumReleaseAgeExclude !== undefined) {
          return user.minimumReleaseAgeExclude.map((pattern): ScopedReleaseAgeExcludePattern => ({
            pattern,
            scope: "user",
          }));
        }
      }
      return [];
    }).pipe(Effect.withSpan("SettingsReader.minimumReleaseAgeExclude")),
    configuredAgents: settings.pipe(
      Effect.map((value) => value.agents ?? []),
      Effect.withSpan("SettingsReader.configuredAgents"),
    ),
    instructionsConfig: settings.pipe(
      Effect.map((value) => Option.fromUndefinedOr(value.instructionFiles)),
      Effect.withSpan("SettingsReader.instructionsConfig"),
    ),
    knowledgeDiscoveryConfig: settings.pipe(
      Effect.map((value) =>
        resolveKnowledgeDiscoveryConfig({
          ...(value.knowledgeConfig?.instructions === false ? { instructions: false } : {}),
        }),
      ),
      Effect.withSpan("SettingsReader.knowledgeDiscoveryConfig"),
    ),
    entries: (type) =>
      settings.pipe(
        Effect.map((value) => settingsEntries[type].entries(value)),
        Effect.withSpan("SettingsReader.entries"),
      ),
  };
};

export const SettingsReaderLive: Layer.Layer<
  SettingsReader,
  never,
  WorkspaceLocation | WorkspaceDocuments | WorkspaceStateShared
> = Layer.effect(
  SettingsReader,
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const shared = yield* WorkspaceStateShared;
    return makeSettingsReader(location, yield* WorkspaceDocuments, shared.sourcesCache);
  }),
);

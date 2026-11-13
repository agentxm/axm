import type { SettingsReaderService } from "./read-contracts.js";
export type { SettingsReaderService } from "./read-contracts.js";
import { copyWorkspaceDocument } from "../desired/copy-document.js";
import { freezeWorkspaceValue } from "../desired/freeze-value.js";
/**
 * Settings reader: the selected scope's desired-state document and the
 * settings-derived facts commands consult — merged registries, owner,
 * publication default, release-age policy, configured agents, instruction
 * and Knowledge discovery configuration, and the per-type entry maps.
 *
 * Persistence is supplied through the workspace's document operations; this
 * reader owns precedence, defaults, and phase-local source reuse.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";

import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import type { ScopedReleaseAgeExcludePattern } from "@agentxm/extension-model/unstable/extensions/release-age";
import { resolveKnowledgeDiscoveryConfig } from "../desired/discovery-config.js";
import { DEFAULT_MINIMUM_RELEASE_AGE } from "../desired/settings/index.js";
import type { MinimumReleaseAge, SourceHostConfig } from "../desired/settings/index.js";
import { settingsEntries } from "./entry-accessors.js";
import { WorkspaceDocuments, type WorkspaceDocumentsService } from "./documents.js";
import { WorkspaceLocation, type WorkspaceLocationService } from "./location.js";
import type { WorkspaceSettingsReadFailure } from "./contracts.js";
import { defaultRegistrySelection, mergeSources } from "./registry-selection.js";

type Read<A> = Effect.Effect<A, WorkspaceSettingsReadFailure>;

/** A configured Registry host. */
type RegistrySourceHost = Extract<SourceHostConfig, { readonly type: "registry" }>;

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

export class SettingsReader extends ServiceMap.Service<SettingsReader, SettingsReaderService>()(
  "@agentxm/workspace-kernel/workspace-state/SettingsReader",
) {}

export const makeSettingsReader = (
  location: WorkspaceLocationService,
  documents: WorkspaceDocumentsService,
  sourcesCache?: Ref.Ref<Option.Option<ReadonlyArray<SourceHostConfig>>>,
  isActive: () => boolean = () => true,
): SettingsReaderService => {
  const settings = documents.settings();
  const userSettings = documents.settings("user");
  const projectSettings = documents.settings("project");

  const defaultRegistry: Read<string> = Effect.gen(function* () {
    return defaultRegistrySelection(yield* projectSettings, yield* userSettings).name;
  }).pipe(Effect.withSpan("SettingsReader.defaultRegistry"));

  const configuredSources: Read<ReadonlyArray<SourceHostConfig>> = Effect.gen(function* () {
    const cached = sourcesCache === undefined ? Option.none() : yield* Ref.get(sourcesCache);
    if (isActive() && Option.isSome(cached)) return cached.value;
    const merged = mergeSources(
      (yield* projectSettings).sources ?? [],
      (yield* userSettings).sources ?? [],
      location.builtInSources,
    );
    if (sourcesCache !== undefined && isActive()) {
      const shared = freezeWorkspaceValue(merged.map(copyWorkspaceDocument));
      yield* Ref.set(sourcesCache, Option.some(shared));
      return shared;
    }
    return merged;
  }).pipe(Effect.withSpan("SettingsReader.configuredSources"));

  const registrySourceHosts: Read<ReadonlyArray<RegistrySourceHost>> = configuredSources.pipe(
    Effect.map((sources) => sources.filter((s): s is RegistrySourceHost => s.type === "registry")),
  );

  return {
    settings,
    configuredSources,
    sourceByName: (name) =>
      configuredSources.pipe(
        Effect.map((sources) => Option.fromUndefinedOr(sources.find((s) => s.name === name))),
      ),
    registrySourceHosts,
    defaultRegistry,
    bindRegistrySource: Effect.fn("SettingsReader.bindRegistrySource")(function* (locator) {
      const sourceName = bindRegistrySource(locator.sourceName, yield* defaultRegistry);
      const hosts = yield* registrySourceHosts;
      return {
        sourceName,
        host: Option.fromUndefinedOr(hosts.find((host) => host.name === sourceName)),
      };
    }),
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
  WorkspaceLocation | WorkspaceDocuments
> = Layer.effect(
  SettingsReader,
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    return makeSettingsReader(location, yield* WorkspaceDocuments);
  }),
);

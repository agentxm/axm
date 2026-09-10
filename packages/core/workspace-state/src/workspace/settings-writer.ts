/**
 * Settings writer: every settings-only mutation of the selected scope —
 * owner, source hosts, instruction-file configuration, agent membership, and
 * one configured entry at a time. Each write protects the settings file with
 * the active transaction, publishes atomically, and is serialized by the
 * workspace's mutation mutex.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import type * as Semaphore from "effect/Semaphore";

import { ConfigurableAgentIdSchema } from "@agentxm/extension-model/unstable/extensions";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import {
  writeSettingsAtPath,
  type InstructionsConfigValue,
  type Settings,
  type SourceHostConfig,
} from "../settings/index.js";
import { settingsEntries, type SettingsEntryByType } from "./entry-accessors.js";
import { InvalidAgentId, SettingsEntryMissing } from "./errors.js";
import { withLayoutOwner, type WorkspaceLayout } from "./layout.js";
import { WorkspaceLocation, type WorkspaceLocationService } from "./location.js";
import type { WorkspaceSettingsMutationFailure } from "./service-interface.js";
import { WorkspaceStateShared } from "./shared.js";
import { readSettingsOrDefault } from "./state-cells.js";

type Write<A = void, E = never> = Effect.Effect<
  A,
  WorkspaceSettingsMutationFailure | E,
  FileSystem.FileSystem | Path.Path
>;

export interface SettingsWriterService {
  /** Record the owner in the selected scope's settings and in the resolved layout. */
  readonly setOwner: (owner: Handle) => Write<WorkspaceLayout>;
  /** Append a source to the selected scope's settings and drop the merged-source cache. */
  readonly addConfiguredSource: (source: SourceHostConfig) => Write;
  /** Set instruction-file config. `false` is explicit manual mode. */
  readonly setInstructionsConfig: (config: InstructionsConfigValue) => Write;
  /** Append an agent ID when absent. Fails typed when the ID is not configurable. */
  readonly addConfiguredAgent: (agentId: string) => Write<void, InvalidAgentId>;
  /** Remove an agent ID when present. Fails typed when the ID is not configurable. */
  readonly removeConfiguredAgent: (agentId: string) => Write<void, InvalidAgentId>;
  /** Create or overwrite one configured entry. */
  readonly setEntry: <T extends InstallableExtensionType>(
    type: T,
    name: string,
    entry: SettingsEntryByType[T],
  ) => Write;
  /**
   * Update one configured entry. A missing skill or MCP server entry fails
   * typed; a missing entry of any other type is a no-op.
   */
  readonly updateEntry: <T extends InstallableExtensionType>(
    type: T,
    name: string,
    update: (entry: SettingsEntryByType[T]) => SettingsEntryByType[T],
  ) => Write<void, SettingsEntryMissing>;
  /** Remove one configured entry. No-op when absent. */
  readonly removeEntry: (type: InstallableExtensionType, name: string) => Write;
}

export class SettingsWriter extends ServiceMap.Service<SettingsWriter, SettingsWriterService>()(
  "@agentxm/workspace-state/SettingsWriter",
) {}

/** Entry types whose update of a missing entry is a typed failure. */
const missingEntryFailure = (
  type: InstallableExtensionType,
  name: string,
): Option.Option<SettingsEntryMissing> =>
  type === "skill" || type === "mcp-server"
    ? Option.some(new SettingsEntryMissing({ entryType: type, name }))
    : Option.none();

export const makeSettingsWriter = (
  location: WorkspaceLocationService,
  mutex: Semaphore.Semaphore,
  invalidateSources: Effect.Effect<void>,
): SettingsWriterService => {
  const current = readSettingsOrDefault(location, location.runtimeDir);
  const write = (settings: Settings) => writeSettingsAtPath(location.settingsPath, settings);
  const serialized = mutex.withPermits(1);
  const validAgentId = (agentId: string) =>
    Schema.decodeUnknownEffect(ConfigurableAgentIdSchema)(agentId).pipe(
      Effect.mapError((cause) => new InvalidAgentId({ agentId, cause })),
    );

  return {
    setOwner: (owner) =>
      serialized(
        Effect.gen(function* () {
          yield* write({ ...(yield* current), owner });
          return yield* Ref.updateAndGet(location.layout, (layout) =>
            withLayoutOwner(layout, owner),
          );
        }),
      ).pipe(Effect.withSpan("SettingsWriter.setOwner")),
    addConfiguredSource: (source) =>
      serialized(
        Effect.gen(function* () {
          const settings = yield* current;
          yield* write({ ...settings, sources: [...(settings.sources ?? []), source] });
          yield* invalidateSources;
        }),
      ).pipe(Effect.withSpan("SettingsWriter.addConfiguredSource")),
    setInstructionsConfig: (config) =>
      serialized(
        Effect.flatMap(current, (settings) => write({ ...settings, instructionFiles: config })),
      ).pipe(Effect.withSpan("SettingsWriter.setInstructionsConfig")),
    addConfiguredAgent: (agentId) =>
      serialized(
        Effect.gen(function* () {
          const validId = yield* validAgentId(agentId);
          const settings = yield* current;
          const agents = settings.agents ?? [];
          if (agents.includes(validId)) return;
          yield* write({ ...settings, agents: [...agents, validId] });
        }),
      ),
    removeConfiguredAgent: (agentId) =>
      serialized(
        Effect.gen(function* () {
          const validId = yield* validAgentId(agentId);
          const settings = yield* current;
          const agents = settings.agents ?? [];
          if (!agents.includes(validId)) return;
          yield* write({
            ...settings,
            agents: agents.filter((configured) => configured !== validId),
          });
        }),
      ),
    setEntry: (type, name, entry) =>
      serialized(
        Effect.flatMap(current, (settings) =>
          write(settingsEntries[type].set(settings, name, entry)),
        ),
      ).pipe(Effect.withSpan("SettingsWriter.setEntry")),
    updateEntry: (type, name, update) =>
      serialized(
        Effect.gen(function* () {
          const settings = yield* current;
          const accessor = settingsEntries[type];
          const existing = accessor.entry(settings, name);
          if (Option.isNone(existing)) {
            const failure = missingEntryFailure(type, name);
            return Option.isSome(failure) ? yield* failure.value : undefined;
          }
          yield* write(accessor.set(settings, name, update(existing.value)));
        }),
      ).pipe(Effect.withSpan("SettingsWriter.updateEntry")),
    removeEntry: (type, name) =>
      serialized(
        Effect.gen(function* () {
          const settings = yield* current;
          const accessor = settingsEntries[type];
          if (accessor.entries(settings)[name] === undefined) return;
          yield* write(accessor.remove(settings, name));
        }),
      ).pipe(Effect.withSpan("SettingsWriter.removeEntry")),
  };
};

export const SettingsWriterLive: Layer.Layer<
  SettingsWriter,
  never,
  WorkspaceLocation | WorkspaceStateShared
> = Layer.effect(
  SettingsWriter,
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const shared = yield* WorkspaceStateShared;
    return makeSettingsWriter(location, shared.mutex, Ref.set(shared.sourcesCache, Option.none()));
  }),
);

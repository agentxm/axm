/**
 * Settings service for centralized settings file I/O.
 *
 * Provides query and mutation methods backed by a Semaphore(1) to serialize
 * mutations. Auto-creates `settings.json` with `{}\n` on first access.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { AgentIdSchema } from "../extensions/common.js";
import {
  detectFormatting,
  ensureTopLevelProperty,
  modifyJsonFile,
} from "./format-preserving-json.js";
import type { Settings, SkillsMap } from "./schema.js";
import {
  createDefaultSettings,
  DEFAULT_SCOPE,
  readSettings,
  SETTINGS_FILENAME,
  SettingsParseError,
  type SettingsError,
  SettingsWriteError,
  writeSettings,
} from "./settings.js";
import { Workspace } from "../workspace/service.js";

// -----------------------------------------------------------------------------
// Service Interface
// -----------------------------------------------------------------------------

/**
 * Settings service interface.
 *
 * Provides 3 query methods (no semaphore) and 3 mutation methods (serialized
 * by a Semaphore(1) to prevent interleaving of read-modify-write cycles).
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SettingsServiceInterface {
  /** Read settings and return the effective scope, defaulting to `"@community"`. */
  readonly getScope: () => Effect.Effect<string, SettingsError>;
  /** Read settings and return the configured agent IDs, defaulting to `[]`. */
  readonly getAgents: () => Effect.Effect<ReadonlyArray<string>, SettingsError>;
  /** Read settings and return the skills map, defaulting to `{}`. */
  readonly getSkills: () => Effect.Effect<SkillsMap, SettingsError>;
  /** Add or update a skill entry and write to disk. Serialized by semaphore. */
  readonly addSkill: (name: string, source: string) => Effect.Effect<void, SettingsError>;
  /** Remove a skill entry and write to disk. No-op if absent. Serialized by semaphore. */
  readonly removeSkill: (name: string) => Effect.Effect<void, SettingsError>;
  /** Append an agent ID if not already present and write to disk. Serialized by semaphore. */
  readonly addAgent: (agentId: string) => Effect.Effect<void, SettingsError>;
}

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

/**
 * Effect service tag for settings.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class SettingsService extends Context.Tag("@axm.sh/cli/SettingsService")<
  SettingsService,
  SettingsServiceInterface
>() {}

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

/**
 * Live layer for {@link SettingsService}.
 *
 * Depends on {@link Workspace} for the `.axm` directory path and
 * `FileSystem` for disk I/O. Constructs a Semaphore(1) to serialize
 * mutation methods.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SettingsServiceLive: Layer.Layer<
  SettingsService,
  never,
  Workspace | FileSystem.FileSystem | Path.Path
> = Layer.effect(
  SettingsService,
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const semaphore = yield* Effect.makeSemaphore(1);

    const axmDir = ws.path;
    const fsLayer = Layer.merge(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );

    // -------------------------------------------------------------------------
    // Internal helper: read settings or create with {} if not found
    // -------------------------------------------------------------------------

    const readOrCreate = (): Effect.Effect<Settings, SettingsError> =>
      readSettings(axmDir).pipe(
        Effect.catchTag("SettingsNotFoundError", () =>
          writeSettings(axmDir, {}).pipe(Effect.as(createDefaultSettings())),
        ),
        Effect.provide(fsLayer),
      );

    // -------------------------------------------------------------------------
    // Mutation wrapper
    // -------------------------------------------------------------------------

    const withMutex = semaphore.withPermits(1);

    // -------------------------------------------------------------------------
    // Service implementation
    // -------------------------------------------------------------------------

    return {
      getScope: () => readOrCreate().pipe(Effect.map((s) => s.scope ?? DEFAULT_SCOPE)),

      getAgents: () => readOrCreate().pipe(Effect.map((s) => s.agents ?? [])),

      getSkills: () => readOrCreate().pipe(Effect.map((s) => s.skills ?? ({} satisfies SkillsMap))),

      addSkill: (name, source) =>
        withMutex(
          Effect.gen(function* () {
            const current = yield* readOrCreate();
            const settingsPath = path.join(axmDir, SETTINGS_FILENAME);

            // Ensure "skills" key exists before nested modify. jsonc-parser's
            // modify rewrites all siblings when inserting a new top-level
            // property, which reformats compact arrays to multi-line.
            if (!current.skills) {
              let text = yield* fs.readFileString(settingsPath).pipe(
                Effect.mapError(
                  (error) =>
                    new SettingsWriteError({
                      path: settingsPath,
                      message: `Failed to read settings for skill addition: ${settingsPath}`,
                      cause: error,
                    }),
                ),
              );
              text = ensureTopLevelProperty(text, "skills", {}, detectFormatting(text));
              yield* fs.writeFileString(settingsPath, text).pipe(
                Effect.mapError(
                  (error) =>
                    new SettingsWriteError({
                      path: settingsPath,
                      message: `Failed to write settings for skill addition: ${settingsPath}`,
                      cause: error,
                    }),
                ),
              );
            }

            yield* modifyJsonFile(settingsPath, [{ path: ["skills", name], value: source }]).pipe(
              Effect.provide(fsLayer),
            );
          }),
        ),

      removeSkill: (name) =>
        withMutex(
          Effect.gen(function* () {
            const current = yield* readOrCreate();
            if (!current.skills || !(name in current.skills)) return;
            const settingsPath = path.join(axmDir, SETTINGS_FILENAME);
            yield* modifyJsonFile(settingsPath, [
              { path: ["skills", name], value: undefined },
            ]).pipe(Effect.provide(fsLayer));
          }),
        ),

      addAgent: (agentId) =>
        withMutex(
          Effect.gen(function* () {
            const validId = yield* Schema.decodeUnknown(AgentIdSchema)(agentId).pipe(
              Effect.mapError(
                (error) =>
                  new SettingsParseError({
                    path: axmDir,
                    message: `Invalid agent ID: ${agentId}`,
                    cause: error,
                  }),
              ),
            );
            const current = yield* readOrCreate();
            const agents: readonly string[] = current.agents ?? [];
            if (agents.includes(validId)) return;
            const updatedAgents = [...agents, validId];
            const settingsPath = path.join(axmDir, SETTINGS_FILENAME);
            yield* modifyJsonFile(settingsPath, [{ path: ["agents"], value: updatedAgents }]).pipe(
              Effect.provide(fsLayer),
            );
          }),
        ),
    };
  }),
);

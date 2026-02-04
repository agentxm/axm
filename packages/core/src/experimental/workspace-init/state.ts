/**
 * State loading and building for workspace initialization.
 *
 * Provides functions to:
 * - Load actual initialization state from disk
 * - Build ideal initialization state from detected agents
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { AgentConfig } from "../agents/types.js";
import { SettingsSchema } from "../schemas/settings.js";
import { DEFAULT_SCOPE } from "../skills/settings.js";
import { type ActualInitState, type IdealInitState, InitValidity } from "./types.js";

// =============================================================================
// Constants
// =============================================================================

const SETTINGS_FILENAME = "settings.json";

// =============================================================================
// Load Actual State
// =============================================================================

/**
 * Load actual initialization state by checking .axm/settings.json.
 *
 * Returns:
 * - Valid: Settings file exists and passes schema validation
 * - NotInitialized: No settings file exists
 * - Invalid: Settings file exists but fails JSON parsing or schema validation
 *
 * @param axmDir - Path to the .axm directory
 * @returns ActualInitState with validity information
 *
 * @experimental This API is unstable and may change without notice.
 */
export const loadActualInitState = (
  axmDir: string,
): Effect.Effect<ActualInitState, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const settingsPath = `${axmDir}/${SETTINGS_FILENAME}`;

    // Check if file exists
    const exists = yield* fs
      .exists(settingsPath)
      .pipe(Effect.catchAll(() => Effect.succeed(false)));

    if (!exists) {
      return { validity: InitValidity.NotInitialized() };
    }

    // Read file contents
    const contentResult = yield* fs.readFileString(settingsPath).pipe(Effect.either);

    if (contentResult._tag === "Left") {
      return {
        validity: InitValidity.Invalid(`Failed to read settings file: ${settingsPath}`),
      };
    }

    const content = contentResult.right;

    // Parse JSON
    const jsonResult = yield* Effect.try({
      try: () => JSON.parse(content) as unknown,
      catch: (error) =>
        InitValidity.Invalid(
          `Failed to parse settings JSON: ${error instanceof Error ? error.message : String(error)}`,
        ),
    }).pipe(Effect.either);

    if (jsonResult._tag === "Left") {
      return { validity: jsonResult.left };
    }

    // Validate schema
    const parseResult = yield* Schema.decodeUnknown(SettingsSchema)(jsonResult.right).pipe(
      Effect.either,
    );

    if (parseResult._tag === "Left") {
      return {
        validity: InitValidity.Invalid(`Invalid settings format: ${parseResult.left.message}`),
      };
    }

    return { validity: InitValidity.Valid(parseResult.right) };
  });

// =============================================================================
// Build Ideal State
// =============================================================================

/**
 * Build ideal initialization state from detected agents and scope.
 *
 * Uses @community as default scope when not specified.
 *
 * @param agents - Detected agent configurations
 * @param scope - Optional scope override (defaults to @community)
 * @returns IdealInitState with agents and scope
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildIdealInitState = (
  agents: readonly AgentConfig[],
  scope?: string,
): IdealInitState => ({
  agents,
  scope: scope ?? DEFAULT_SCOPE,
});

/**
 * Apply logic for workspace initialization - executes the diff/plan.
 *
 * This module handles the actual file operations to initialize a workspace:
 * - For Add: Creates .axm/ directory and writes settings.json
 * - For Update: Overwrites existing settings.json, preserving skills
 * - For Unchanged: No-op
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { FileSystem } from "@effect/platform";
import { Data, Effect } from "effect";

import type { Settings } from "../schemas/settings.js";
import type { IdealInitState, InitChange } from "./types.js";

// =============================================================================
// Constants
// =============================================================================

const SETTINGS_FILENAME = "settings.json";

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error during apply operation.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class ApplyInitError extends Data.TaggedError("ApplyInitError")<{
  readonly message: string;
  readonly operation: "createDirectory" | "writeSettings";
  readonly cause?: unknown;
}> {}

// =============================================================================
// Options Types
// =============================================================================

/**
 * Options for apply operations.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ApplyInitOptions {
  /** Path to the .axm directory */
  readonly axmDir: string;
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Convert IdealInitState to Settings object.
 *
 * Extracts agent IDs from AgentConfig objects.
 */
const idealToSettings = (ideal: IdealInitState, existingSettings?: Settings): Settings => {
  const agentIds = ideal.agents.map((agent) => agent.id);
  return {
    // Preserve existing skills if updating
    ...(existingSettings?.skills && { skills: existingSettings.skills }),
    ...(existingSettings?.commands && { commands: existingSettings.commands }),
    ...(existingSettings?.packs && { packs: existingSettings.packs }),
    ...(existingSettings?.["mcp-servers"] && { "mcp-servers": existingSettings["mcp-servers"] }),
    ...(existingSettings?.sources && { sources: existingSettings.sources }),
    // Set new agents and scope
    agents: agentIds as Settings["agents"],
    scope: ideal.scope,
  };
};

/**
 * Write settings to .axm/settings.json.
 *
 * Creates the directory if it doesn't exist. Pretty-prints JSON with 2-space indent.
 */
const writeSettings = (
  axmDir: string,
  settings: Settings,
): Effect.Effect<void, ApplyInitError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const settingsPath = `${axmDir}/${SETTINGS_FILENAME}`;

    // Ensure directory exists
    yield* fs.makeDirectory(axmDir, { recursive: true }).pipe(
      Effect.mapError(
        (error) =>
          new ApplyInitError({
            message: `Failed to create directory: ${axmDir}`,
            operation: "createDirectory",
            cause: error,
          }),
      ),
    );

    // Serialize to JSON with pretty printing
    const content = JSON.stringify(settings, null, 2);

    // Write file
    yield* fs.writeFileString(settingsPath, content).pipe(
      Effect.mapError(
        (error) =>
          new ApplyInitError({
            message: `Failed to write settings file: ${settingsPath}`,
            operation: "writeSettings",
            cause: error,
          }),
      ),
    );
  });

// =============================================================================
// Apply Functions
// =============================================================================

/**
 * Apply an initialization change.
 *
 * - For Add: Creates .axm/ directory and writes settings.json with agents and scope
 * - For Update: Overwrites settings.json, preserving existing skills configuration
 * - For Unchanged: No-op
 *
 * @param change - The initialization change to apply
 * @param options - Apply options containing axmDir path
 * @returns Effect that completes when the change is applied
 *
 * @experimental This API is unstable and may change without notice.
 */
export const applyInitDiff = (
  change: InitChange,
  options: ApplyInitOptions,
): Effect.Effect<void, ApplyInitError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const { axmDir } = options;

    switch (change._tag) {
      case "Add": {
        const settings = idealToSettings(change.ideal);
        yield* writeSettings(axmDir, settings);
        break;
      }
      case "Update": {
        // Preserve existing extensions when updating
        const settings = idealToSettings(change.to, change.from);
        yield* writeSettings(axmDir, settings);
        break;
      }
      case "Unchanged": {
        // No-op: workspace is already initialized with same configuration
        break;
      }
    }
  });

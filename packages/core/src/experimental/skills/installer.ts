/**
 * Skill installation to agent directories using symlinks with copy fallback.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import path from "node:path";
import { FileSystem } from "@effect/platform";
import { Data, Effect } from "effect";
import type { AgentConfig, Skill } from "./types.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const SKILLS_DIRNAME = "skills";

// -----------------------------------------------------------------------------
// Error Types
// -----------------------------------------------------------------------------

/**
 * Error during skill installation.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class InstallError extends Data.TaggedError("InstallError")<{
  /** What operation failed */
  readonly operation:
    | "copy-to-canonical"
    | "create-symlink"
    | "copy-fallback"
    | "read-directory"
    | "remove";
  /** Human-readable error message */
  readonly message: string;
  /** Path that caused the error */
  readonly path?: string;
  /** Original error cause */
  readonly cause?: unknown;
}> {}

// -----------------------------------------------------------------------------
// Installation Result Types
// -----------------------------------------------------------------------------

/**
 * Method used for installation.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type InstallMethod = "symlink" | "copy";

/**
 * Result of installing a skill.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface InstallResult {
  /** Skill name that was installed */
  readonly skillName: string;
  /** Method used (symlink or copy) */
  readonly method: InstallMethod;
  /** Path to canonical location */
  readonly canonicalPath: string;
  /** Path to agent-specific location */
  readonly agentPath: string;
}

// -----------------------------------------------------------------------------
// Internal Helpers
// -----------------------------------------------------------------------------

/**
 * Recursively copy a directory.
 */
const copyDirectory = (
  srcDir: string,
  destDir: string,
): Effect.Effect<void, InstallError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    // Ensure destination exists
    yield* fs.makeDirectory(destDir, { recursive: true }).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            operation: "copy-fallback",
            message: `Failed to create directory: ${destDir}`,
            path: destDir,
            cause: error,
          }),
      ),
    );

    // Read source directory entries
    const entries = yield* fs.readDirectory(srcDir).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            operation: "read-directory",
            message: `Failed to read directory: ${srcDir}`,
            path: srcDir,
            cause: error,
          }),
      ),
    );

    // Process each entry
    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry);
      const destPath = path.join(destDir, entry);

      const stat = yield* fs.stat(srcPath).pipe(
        Effect.mapError(
          (error) =>
            new InstallError({
              operation: "read-directory",
              message: `Failed to stat: ${srcPath}`,
              path: srcPath,
              cause: error,
            }),
        ),
      );

      if (stat.type === "Directory") {
        // Recursively copy subdirectory
        yield* copyDirectory(srcPath, destPath);
      } else {
        // Copy file
        yield* fs.copyFile(srcPath, destPath).pipe(
          Effect.mapError(
            (error) =>
              new InstallError({
                operation: "copy-fallback",
                message: `Failed to copy file: ${srcPath}`,
                path: srcPath,
                cause: error,
              }),
          ),
        );
      }
    }
  });

// -----------------------------------------------------------------------------
// Core Functions
// -----------------------------------------------------------------------------

/**
 * Copy skill files to the canonical .axm/skills/<skill-name>/ location.
 *
 * Creates the destination directory if it doesn't exist.
 * Overwrites existing files if present.
 *
 * @param skill - Skill to copy
 * @param axmDir - Path to .axm directory
 * @returns Path to the canonical skill directory
 *
 * @experimental This API is unstable and may change without notice.
 */
export const copySkillToCanonical = (
  skill: Skill,
  axmDir: string,
): Effect.Effect<string, InstallError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const canonicalPath = path.join(axmDir, SKILLS_DIRNAME, skill.name);

    // Get the skill source directory (parent of SKILL.md)
    const skillSourceDir = path.dirname(skill.path);

    // Check if source is a file or directory
    const sourceStat = yield* fs.stat(skill.path).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            operation: "copy-to-canonical",
            message: `Failed to stat skill path: ${skill.path}`,
            path: skill.path,
            cause: error,
          }),
      ),
    );

    // Ensure canonical directory exists
    yield* fs.makeDirectory(canonicalPath, { recursive: true }).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            operation: "copy-to-canonical",
            message: `Failed to create canonical directory: ${canonicalPath}`,
            path: canonicalPath,
            cause: error,
          }),
      ),
    );

    if (sourceStat.type === "File") {
      // If skill.path points directly to SKILL.md, copy the entire parent directory
      yield* copyDirectory(skillSourceDir, canonicalPath);
    } else {
      // If skill.path is a directory, copy it directly
      yield* copyDirectory(skill.path, canonicalPath);
    }

    return canonicalPath;
  });

/**
 * Create a symlink from agent's skills directory to canonical location.
 *
 * Uses relative paths for portable symlinks.
 * Handles existing symlinks by removing and recreating.
 *
 * @param canonicalPath - Absolute path to canonical skill directory
 * @param agent - Agent configuration
 * @param skillName - Name of the skill
 * @returns Effect that creates the symlink
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createAgentSymlink = (
  canonicalPath: string,
  agent: AgentConfig,
  skillName: string,
): Effect.Effect<string, InstallError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    // Determine agent's skills directory
    const agentSkillsDir = agent.skillsDir ?? path.join(agent.detectPath, SKILLS_DIRNAME);
    const symlinkPath = path.join(agentSkillsDir, skillName);

    // Ensure agent skills directory exists
    yield* fs.makeDirectory(agentSkillsDir, { recursive: true }).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            operation: "create-symlink",
            message: `Failed to create agent skills directory: ${agentSkillsDir}`,
            path: agentSkillsDir,
            cause: error,
          }),
      ),
    );

    // Calculate relative path from symlink location to canonical path
    const relativeTarget = path.relative(agentSkillsDir, canonicalPath);

    // Check if symlink already exists
    const exists = yield* fs.exists(symlinkPath).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            operation: "create-symlink",
            message: `Failed to check if path exists: ${symlinkPath}`,
            path: symlinkPath,
            cause: error,
          }),
      ),
    );
    if (exists) {
      // Remove existing symlink/file
      yield* fs.remove(symlinkPath, { recursive: true }).pipe(
        Effect.mapError(
          (error) =>
            new InstallError({
              operation: "remove",
              message: `Failed to remove existing path: ${symlinkPath}`,
              path: symlinkPath,
              cause: error,
            }),
        ),
      );
    }

    // Create the symlink
    yield* fs.symlink(relativeTarget, symlinkPath).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            operation: "create-symlink",
            message: `Failed to create symlink: ${symlinkPath} -> ${relativeTarget}`,
            path: symlinkPath,
            cause: error,
          }),
      ),
    );

    return symlinkPath;
  });

/**
 * Copy skill files to agent's skills directory as fallback when symlink fails.
 *
 * @param canonicalPath - Absolute path to canonical skill directory
 * @param agent - Agent configuration
 * @param skillName - Name of the skill
 * @returns Path to agent's skill directory
 *
 * @experimental This API is unstable and may change without notice.
 */
export const copyToAgent = (
  canonicalPath: string,
  agent: AgentConfig,
  skillName: string,
): Effect.Effect<string, InstallError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    // Determine agent's skills directory
    const agentSkillsDir = agent.skillsDir ?? path.join(agent.detectPath, SKILLS_DIRNAME);
    const destPath = path.join(agentSkillsDir, skillName);

    // Ensure agent skills directory exists
    yield* fs.makeDirectory(agentSkillsDir, { recursive: true }).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            operation: "copy-fallback",
            message: `Failed to create agent skills directory: ${agentSkillsDir}`,
            path: agentSkillsDir,
            cause: error,
          }),
      ),
    );

    // Check if destination already exists
    const exists = yield* fs.exists(destPath).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            operation: "copy-fallback",
            message: `Failed to check if path exists: ${destPath}`,
            path: destPath,
            cause: error,
          }),
      ),
    );
    if (exists) {
      // Remove existing directory/file
      yield* fs.remove(destPath, { recursive: true }).pipe(
        Effect.mapError(
          (error) =>
            new InstallError({
              operation: "remove",
              message: `Failed to remove existing path: ${destPath}`,
              path: destPath,
              cause: error,
            }),
        ),
      );
    }

    // Copy the skill directory
    yield* copyDirectory(canonicalPath, destPath);

    return destPath;
  });

/**
 * Install a skill to an agent's skills directory.
 *
 * Installation flow:
 * 1. Copy skill files to canonical .axm/skills/<skill-name>/ location
 * 2. Create symlink from agent's skills directory to canonical location
 * 3. If symlink fails (e.g., Windows without admin), fall back to copy
 *
 * @param skill - Skill to install
 * @param agent - Target agent configuration
 * @param axmDir - Path to .axm directory
 * @returns Installation result with method used
 *
 * @experimental This API is unstable and may change without notice.
 */
export const installSkill = (
  skill: Skill,
  agent: AgentConfig,
  axmDir: string,
): Effect.Effect<InstallResult, InstallError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    // Step 1: Copy to canonical location
    const canonicalPath = yield* copySkillToCanonical(skill, axmDir);

    // Step 2: Try symlink first
    const symlinkResult = yield* createAgentSymlink(canonicalPath, agent, skill.name).pipe(
      Effect.map((agentPath) => ({
        method: "symlink" as InstallMethod,
        agentPath,
      })),
      Effect.either,
    );

    if (symlinkResult._tag === "Right") {
      return {
        skillName: skill.name,
        method: symlinkResult.right.method,
        canonicalPath,
        agentPath: symlinkResult.right.agentPath,
      };
    }

    // Step 3: Fall back to copy
    const agentPath = yield* copyToAgent(canonicalPath, agent, skill.name);

    return {
      skillName: skill.name,
      method: "copy" as InstallMethod,
      canonicalPath,
      agentPath,
    };
  });

/**
 * Install a skill to multiple agents.
 *
 * @param skill - Skill to install
 * @param agents - Target agent configurations
 * @param axmDir - Path to .axm directory
 * @returns Array of installation results
 *
 * @experimental This API is unstable and may change without notice.
 */
export const installSkillToAgents = (
  skill: Skill,
  agents: readonly AgentConfig[],
  axmDir: string,
): Effect.Effect<readonly InstallResult[], InstallError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    // First copy to canonical location once
    const canonicalPath = yield* copySkillToCanonical(skill, axmDir);

    // Create a skill object with the canonical path for symlink creation
    const _canonicalSkill: Skill = {
      ...skill,
      path: path.join(canonicalPath, "SKILL.md"),
    };

    // Install to each agent concurrently
    const results = yield* Effect.all(
      agents.map((agent) =>
        Effect.gen(function* () {
          // Try symlink first
          const symlinkResult = yield* createAgentSymlink(canonicalPath, agent, skill.name).pipe(
            Effect.map((agentPath) => ({
              method: "symlink" as InstallMethod,
              agentPath,
            })),
            Effect.either,
          );

          if (symlinkResult._tag === "Right") {
            return {
              skillName: skill.name,
              method: symlinkResult.right.method,
              canonicalPath,
              agentPath: symlinkResult.right.agentPath,
            };
          }

          // Fall back to copy
          const agentPath = yield* copyToAgent(canonicalPath, agent, skill.name);

          return {
            skillName: skill.name,
            method: "copy" as InstallMethod,
            canonicalPath,
            agentPath,
          };
        }),
      ),
      { concurrency: "unbounded" },
    );

    return results;
  });

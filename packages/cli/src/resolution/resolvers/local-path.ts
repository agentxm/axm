/**
 * Local path resolver for extension resolution.
 *
 * Handles local filesystem paths: `./`, `../`, `/`, `~/`, Windows paths like `C:\`.
 * Scans directories for extension manifest files and returns ExtensionRef[].
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as os from "node:os";
import * as nodePath from "node:path";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ExtensionRef, ExtensionType, ResolutionOptions } from "../types.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/**
 * Local path pattern.
 * Matches: ./path, ../path, /path, ~/path, ~\path, or Windows paths like C:\path
 */
const LOCAL_PATH_PATTERN = /^(?:\.\.?\/|\/|~\/|~\\|[A-Za-z]:[\\/])/;

/**
 * Extension manifest files mapped to their types.
 */
const EXTENSION_FILES: ReadonlyArray<{ readonly file: string; readonly type: ExtensionType }> = [
  { file: "SKILL.md", type: "skill" },
  { file: "skill.md", type: "skill" },
  { file: "Skill.md", type: "skill" },
  { file: "axm-skill.json", type: "skill" },
  { file: "axm-command.json", type: "command" },
  { file: "axm-mcp-server.json", type: "mcp-server" },
];

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/**
 * Check if an input string matches the local path pattern.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const isLocalPath = (input: string): boolean => LOCAL_PATH_PATTERN.test(input);

/**
 * Expand ~ to home directory.
 */
const expandTilde = (inputPath: string): string => {
  if (inputPath.startsWith("~/") || inputPath.startsWith("~\\")) {
    return nodePath.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
};

/**
 * Resolve a potentially relative path against the cwd option.
 */
const resolvePath = (input: string, cwd: string): string => {
  const expanded = expandTilde(input);
  if (nodePath.isAbsolute(expanded)) {
    return nodePath.normalize(expanded);
  }
  return nodePath.resolve(cwd, expanded);
};

/**
 * Check if a file exists at the given path.
 */
const fileExists = (filePath: string): Effect.Effect<boolean, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const result = yield* fs.exists(filePath).pipe(Effect.catchAll(() => Effect.succeed(false)));
    return result;
  });

/**
 * Check if a path is a directory.
 */
const isDirectory = (dirPath: string): Effect.Effect<boolean, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const stat = yield* fs.stat(dirPath).pipe(Effect.catchAll(() => Effect.succeed(null)));
    return stat !== null && stat.type === "Directory";
  });

/**
 * Scan a directory for extension manifest files.
 * Returns ExtensionRef for each found manifest.
 */
const scanDirectory = (
  dirPath: string,
  originalInput: string,
): Effect.Effect<ExtensionRef[], never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    // Check all extension files concurrently
    const existsResults = yield* Effect.forEach(
      EXTENSION_FILES,
      ({ file }) => fileExists(nodePath.join(dirPath, file)),
      { concurrency: "unbounded" },
    );

    // Build results, filtering duplicates for skill type
    const results: ExtensionRef[] = [];
    for (let i = 0; i < EXTENSION_FILES.length; i++) {
      const extensionFile = EXTENSION_FILES[i];
      if (!existsResults[i] || !extensionFile) continue;

      const { file, type } = extensionFile;

      // For SKILL.md variants, only add one entry (avoid duplicates)
      if (type === "skill" && results.some((r) => r.type === "skill")) {
        continue;
      }

      results.push({
        type,
        source: "local",
        origin: dirPath,
        originalInput,
        ref: Option.none(),
        name: Option.none(),
        path: Option.none(),
        metadata: {
          version: Option.none(),
          description: Option.none(),
          files: Option.some([file]),
          versionConstraint: Option.none(),
        },
      });
    }

    return results;
  });

/**
 * Handle a direct file path (pointing to a manifest file).
 */
const handleFilePath = (
  filePath: string,
  originalInput: string,
): Effect.Effect<ExtensionRef[], never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const basename = nodePath.basename(filePath).toLowerCase();
    const dirPath = nodePath.dirname(filePath);

    // Determine type from filename
    let type: ExtensionType | null = null;
    if (basename === "skill.md" || basename === "axm-skill.json") {
      type = "skill";
    } else if (basename === "axm-command.json") {
      type = "command";
    } else if (basename === "axm-mcp-server.json") {
      type = "mcp-server";
    }

    if (type === null) {
      // Not a recognized extension file
      return [];
    }

    const exists = yield* fileExists(filePath);
    if (!exists) {
      return [];
    }

    return [
      {
        type,
        source: "local",
        origin: dirPath,
        originalInput,
        ref: Option.none(),
        name: Option.none(),
        path: Option.none(),
        metadata: {
          version: Option.none(),
          description: Option.none(),
          files: Option.some([nodePath.basename(filePath)]),
          versionConstraint: Option.none(),
        },
      },
    ];
  });

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Resolve a local filesystem path to extension references.
 *
 * This resolver handles:
 * - Relative paths: `./path`, `../path`
 * - Absolute POSIX paths: `/path`
 * - Home directory paths: `~/path`, `~\path`
 * - Windows paths: `C:\path`
 *
 * Returns an empty array if:
 * - Input doesn't match local path pattern
 * - Path doesn't exist on filesystem
 * - No extension manifest files found in directory
 *
 * @param input - The input string to resolve
 * @param options - Resolution options including cwd
 * @returns Effect containing ExtensionRef[] (empty if no match)
 *
 * @experimental This API is unstable and may change without notice.
 */
export const resolveLocalPath = (
  input: string,
  options: ResolutionOptions,
): Effect.Effect<ExtensionRef[], never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    // Check if input matches local path pattern
    if (!isLocalPath(input)) {
      return [];
    }

    const cwd = Option.getOrElse(options.cwd, () => process.cwd());
    const absolutePath = resolvePath(input, cwd);

    // Check if path exists
    const exists = yield* fileExists(absolutePath);
    if (!exists) {
      return [];
    }

    // Check if it's a directory or file
    const isDir = yield* isDirectory(absolutePath);

    if (isDir) {
      // Scan directory for extension files
      return yield* scanDirectory(absolutePath, input);
    }

    // Handle direct file path
    return yield* handleFilePath(absolutePath, input);
  });

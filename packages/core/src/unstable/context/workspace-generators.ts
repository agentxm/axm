/**
 * Workspace-owned inline generator region sync.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { makeAppError, type AppError } from "../app-error/index.js";
import {
  generateFileIndex,
  generateTableOfContents,
  isFileIndexColumn,
  type FileIndexColumn,
  type FileIndexOptions,
} from "./generators.js";
import {
  commentStyleForTarget,
  parseRegionMarker,
  replaceManagedRegion,
  type FileCommentStyle,
  type FileRegionMarkerIdentity,
} from "./markers.js";

export interface RenderWorkspaceGeneratorRegionsArgs {
  readonly workspaceRoot: string;
  readonly dryRun?: boolean | undefined;
  readonly maxDepth?: number | undefined;
}

export interface WorkspaceGeneratorRegionResult {
  readonly scannedFiles: number;
  readonly renderedRegions: number;
  readonly changedFiles: number;
  readonly dryRun: boolean;
}

interface WorkspaceGeneratorRegion {
  readonly filePath: string;
  readonly marker: FileRegionMarkerIdentity;
  readonly style: FileCommentStyle;
  readonly startLine: string;
  readonly options: Readonly<Record<string, string>>;
}

interface IgnorePattern {
  readonly pattern: string;
  readonly negated: boolean;
  readonly directoryOnly: boolean;
}

const normalizeRelativePath = (relativePath: string): string => relativePath.replaceAll("\\", "/");

const parseGitignore = (content: string): ReadonlyArray<IgnorePattern> =>
  content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => {
      const negated = line.startsWith("!");
      const rawPattern = negated ? line.slice(1) : line;
      const directoryOnly = rawPattern.endsWith("/");
      return {
        pattern: normalizeRelativePath(directoryOnly ? rawPattern.slice(0, -1) : rawPattern),
        negated,
        directoryOnly,
      };
    });

const matchesIgnorePattern = (
  relativePath: string,
  basename: string,
  isDirectory: boolean,
  pattern: IgnorePattern,
): boolean => {
  const normalizedPath = normalizeRelativePath(relativePath);
  if (pattern.directoryOnly) {
    return normalizedPath === pattern.pattern || normalizedPath.startsWith(`${pattern.pattern}/`);
  }
  if (pattern.pattern.includes("/")) {
    return normalizedPath === pattern.pattern || normalizedPath.startsWith(`${pattern.pattern}/`);
  }
  return (
    basename === pattern.pattern ||
    (isDirectory && normalizedPath.startsWith(`${pattern.pattern}/`))
  );
};

const isIgnored = (
  relativePath: string,
  basename: string,
  isDirectory: boolean,
  patterns: ReadonlyArray<IgnorePattern>,
): boolean => {
  let ignored = false;
  for (const pattern of patterns) {
    if (matchesIgnorePattern(relativePath, basename, isDirectory, pattern)) {
      ignored = !pattern.negated;
    }
  }
  return ignored;
};

const isAlwaysExcluded = (relativePath: string, basename: string): boolean =>
  basename === ".git" ||
  basename === "node_modules" ||
  normalizeRelativePath(relativePath) === ".axm/extensions" ||
  normalizeRelativePath(relativePath).startsWith(".axm/extensions/");

const readRootGitignore = (
  workspaceRoot: string,
): Effect.Effect<ReadonlyArray<IgnorePattern>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const content = yield* fs
      .readFileString(path.join(workspaceRoot, ".gitignore"))
      .pipe(Effect.option);
    return Option.match(content, {
      onNone: () => [],
      onSome: parseGitignore,
    });
  });

const findWorkspaceGeneratorRegions = (
  filePath: string,
  content: string,
  style: FileCommentStyle,
): ReadonlyArray<WorkspaceGeneratorRegion> => {
  const seen = new Set<string>();
  return content.split(/\r?\n/).flatMap((line) => {
    const marker = parseRegionMarker(line, style);
    if (Option.isNone(marker)) return [];
    if (
      marker.value.kind !== "start" ||
      marker.value.generator === undefined ||
      marker.value.ext !== undefined
    ) {
      return [];
    }
    const key = `${marker.value.region}:${marker.value.generator}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [
      {
        filePath,
        marker: { region: marker.value.region, generator: marker.value.generator },
        style,
        startLine: line,
        options: marker.value.options ?? {},
      },
    ];
  });
};

const scanWorkspaceFiles = (
  workspaceRoot: string,
  current: string,
  depth: number,
  maxDepth: number,
  gitignore: ReadonlyArray<IgnorePattern>,
): Effect.Effect<ReadonlyArray<string>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    if (depth > maxDepth) return [];
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* fs.readDirectory(current).pipe(Effect.catch(() => Effect.succeed([])));
    const sorted = [...entries].sort((a, b) => a.localeCompare(b));
    const nested = yield* Effect.forEach(
      sorted,
      (entry) =>
        Effect.gen(function* () {
          const absolute = path.join(current, entry);
          const relative = normalizeRelativePath(path.relative(workspaceRoot, absolute));
          const stat = yield* fs.stat(absolute).pipe(Effect.option);
          if (Option.isNone(stat)) return [] satisfies ReadonlyArray<string>;
          if (
            isAlwaysExcluded(relative, entry) ||
            isIgnored(relative, entry, stat.value.type === "Directory", gitignore)
          ) {
            return [] satisfies ReadonlyArray<string>;
          }
          if (stat.value.type === "Directory") {
            return yield* scanWorkspaceFiles(
              workspaceRoot,
              absolute,
              depth + 1,
              maxDepth,
              gitignore,
            );
          }
          return Option.isSome(commentStyleForTarget(absolute))
            ? ([absolute] satisfies ReadonlyArray<string>)
            : ([] satisfies ReadonlyArray<string>);
        }),
      { concurrency: 1 },
    );
    return nested.flat();
  });

const FILE_INDEX_INLINE_KEYS: ReadonlySet<string> = new Set([
  "format",
  "include",
  "exclude",
  "maxDepth",
  "includeHidden",
  "respectGitignore",
  "columns",
]);

const TOC_INLINE_KEYS: ReadonlySet<string> = new Set<string>();

const splitCsv = (value: string): ReadonlyArray<string> =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");

const parseFileIndexOptions = (
  region: WorkspaceGeneratorRegion,
): Effect.Effect<FileIndexOptions, AppError> =>
  Effect.gen(function* () {
    const result: {
      format?: FileIndexOptions["format"];
      include?: ReadonlyArray<string>;
      exclude?: ReadonlyArray<string>;
      maxDepth?: number;
      includeHidden?: boolean;
      respectGitignore?: boolean;
      columns?: ReadonlyArray<FileIndexColumn>;
    } = {};
    for (const [key, value] of Object.entries(region.options)) {
      if (!FILE_INDEX_INLINE_KEYS.has(key)) {
        return yield* makeAppError({
          code: "validation",
          detail: `Unsupported file-index marker option in ${region.filePath}: ${key}`,
        });
      }
      switch (key) {
        case "format":
          if (value !== "list" && value !== "tree" && value !== "table") {
            return yield* makeAppError({
              code: "validation",
              detail: `Unsupported file-index format in ${region.filePath}: ${value}`,
            });
          }
          result.format = value;
          break;
        case "include":
          result.include = splitCsv(value);
          break;
        case "exclude":
          result.exclude = splitCsv(value);
          break;
        case "maxDepth": {
          const parsed = Number.parseInt(value, 10);
          if (!Number.isInteger(parsed) || parsed < 0) {
            return yield* makeAppError({
              code: "validation",
              detail: `file-index marker option 'maxDepth' must be a non-negative integer in ${region.filePath}`,
            });
          }
          result.maxDepth = parsed;
          break;
        }
        case "includeHidden":
          result.includeHidden = value === "true";
          break;
        case "respectGitignore":
          result.respectGitignore = value !== "false";
          break;
        case "columns": {
          const parts = splitCsv(value);
          const parsed: Array<FileIndexColumn> = [];
          for (const part of parts) {
            if (!isFileIndexColumn(part)) {
              return yield* makeAppError({
                code: "validation",
                detail: `Unknown file-index column in ${region.filePath}: ${part}`,
              });
            }
            parsed.push(part);
          }
          result.columns = parsed;
          break;
        }
      }
    }
    return result;
  });

const validateTocOptions = (region: WorkspaceGeneratorRegion): Effect.Effect<void, AppError> => {
  for (const key of Object.keys(region.options)) {
    if (!TOC_INLINE_KEYS.has(key)) {
      return Effect.fail(
        makeAppError({
          code: "validation",
          detail: `Unsupported toc marker option in ${region.filePath}: ${key}`,
        }),
      );
    }
  }
  return Effect.void;
};

const renderRegion = (
  workspaceRoot: string,
  fileContent: string,
  region: WorkspaceGeneratorRegion,
): Effect.Effect<string, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    switch (region.marker.generator) {
      case "file-index": {
        const options = yield* parseFileIndexOptions(region);
        return yield* generateFileIndex(workspaceRoot, options);
      }
      case "toc":
        yield* validateTocOptions(region);
        return generateTableOfContents(fileContent, {
          marker: region.marker,
          style: region.style,
        });
      default:
        return yield* makeAppError({
          code: "validation",
          detail: `Unsupported workspace file generator: ${region.marker.generator}`,
        });
    }
  });

const replaceRegion = (
  content: string,
  region: WorkspaceGeneratorRegion,
  rendered: string,
): Effect.Effect<string, AppError> =>
  Effect.try({
    try: () =>
      replaceManagedRegion({
        content,
        marker: region.marker,
        rendered,
        style: region.style,
        startLine: region.startLine,
      }),
    catch: (error) =>
      makeAppError({
        code: "validation",
        detail: `Invalid AXM workspace generator region in ${region.filePath}`,
        cause: error,
      }),
  });

/**
 * Render workspace-owned inline generator regions after normal materialization.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const renderWorkspaceGeneratorRegions = ({
  workspaceRoot,
  dryRun = false,
  maxDepth = 8,
}: RenderWorkspaceGeneratorRegionsArgs): Effect.Effect<
  WorkspaceGeneratorRegionResult,
  AppError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const gitignore = yield* readRootGitignore(workspaceRoot);
    const files = yield* scanWorkspaceFiles(workspaceRoot, workspaceRoot, 0, maxDepth, gitignore);
    let renderedRegions = 0;
    let changedFiles = 0;

    for (const filePath of files) {
      const style = commentStyleForTarget(filePath);
      if (Option.isNone(style)) continue;
      const content = yield* fs.readFileString(filePath).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "internal",
            detail: `Failed to read workspace generator target: ${filePath}`,
            cause: error,
          }),
        ),
      );
      const regions = findWorkspaceGeneratorRegions(filePath, content, style.value);
      if (regions.length === 0) continue;
      renderedRegions += regions.length;
      let updated = content;
      for (const region of regions) {
        const rendered = yield* renderRegion(workspaceRoot, content, region);
        updated = yield* replaceRegion(updated, region, rendered);
      }
      if (updated !== content) {
        changedFiles += 1;
        if (!dryRun) {
          yield* fs.writeFileString(filePath, updated).pipe(
            Effect.mapError((error) =>
              makeAppError({
                code: "internal",
                detail: `Failed to write workspace generator target: ${filePath}`,
                cause: error,
              }),
            ),
          );
        }
      }
    }

    return {
      scannedFiles: files.length,
      renderedRegions,
      changedFiles,
      dryRun,
    };
  });

/**
 * Built-in generated content sources for context files packages.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  stripManagedRegion,
  type FileCommentStyle,
  type FileRegionMarkerIdentity,
} from "./markers.js";

export interface TableOfContentsHeading {
  readonly depth: number;
  readonly text: string;
}

export interface FileIndexOptions {
  readonly maxDepth?: number | undefined;
  readonly format?: "list" | "tree" | undefined;
  readonly includeHidden?: boolean | undefined;
  readonly include?: ReadonlyArray<string> | undefined;
  readonly exclude?: ReadonlyArray<string> | undefined;
  readonly respectGitignore?: boolean | undefined;
  readonly descriptors?: boolean | undefined;
}

interface ResolvedFileIndexOptions {
  readonly maxDepth: number;
  readonly format: "list" | "tree";
  readonly includeHidden: boolean;
  readonly include: ReadonlyArray<string>;
  readonly exclude: ReadonlyArray<string>;
  readonly respectGitignore: boolean;
  readonly descriptors: boolean;
  readonly gitignore: ReadonlyArray<IgnorePattern>;
}

interface FileIndexEntry {
  readonly path: string;
  readonly descriptor: Option.Option<string>;
}

interface IgnorePattern {
  readonly pattern: string;
  readonly negated: boolean;
  readonly directoryOnly: boolean;
}

const headingPattern = /^(#{1,6})\s+(.+?)\s*#*$/;

const slugify = (text: string): string =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");

const stripRegion = (
  markdown: string,
  marker: FileRegionMarkerIdentity | undefined,
  style: FileCommentStyle | undefined,
): string => {
  if (marker === undefined || style === undefined) return markdown;
  return stripManagedRegion(markdown, marker, style);
};

export const extractMarkdownHeadings = (
  markdown: string,
  ownRegion?:
    | { readonly marker: FileRegionMarkerIdentity; readonly style: FileCommentStyle }
    | undefined,
): ReadonlyArray<TableOfContentsHeading> => {
  const source = stripRegion(markdown, ownRegion?.marker, ownRegion?.style);
  return source.split(/\r?\n/).flatMap((line) => {
    const match = headingPattern.exec(line);
    const hashes = match?.[1];
    const text = match?.[2];
    return hashes !== undefined && text !== undefined
      ? [{ depth: hashes.length, text: text.trim() }]
      : [];
  });
};

export const generateTableOfContents = (
  markdown: string,
  ownRegion?:
    | { readonly marker: FileRegionMarkerIdentity; readonly style: FileCommentStyle }
    | undefined,
): string =>
  extractMarkdownHeadings(markdown, ownRegion)
    .map(
      (heading) =>
        `${"  ".repeat(Math.max(0, heading.depth - 1))}- [${heading.text}](#${slugify(heading.text)})`,
    )
    .join("\n");

const shouldSkipEntry = (name: string, includeHidden: boolean): boolean =>
  name === ".git" || name === "node_modules" || (!includeHidden && name.startsWith("."));

const normalizeRelativePath = (relativePath: string): string => relativePath.replaceAll("\\", "/");

const escapeRegex = (value: string): string => value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");

const globToRegex = (glob: string): RegExp => {
  const parts = glob.split(/(\*\*|\*|\?)/g);
  const source = parts
    .map((part) => {
      if (part === "**") return ".*";
      if (part === "*") return "[^/]*";
      if (part === "?") return "[^/]";
      return escapeRegex(part);
    })
    .join("");
  return new RegExp(`^${source}$`);
};

const matchesGlob = (relativePath: string, pattern: string): boolean => {
  const normalizedPath = normalizeRelativePath(relativePath);
  const normalizedPattern = normalizeRelativePath(pattern).replace(/^\.?\//, "");
  const basename = normalizedPath.split("/").at(-1) ?? normalizedPath;
  if (!normalizedPattern.includes("/")) {
    const regex = globToRegex(normalizedPattern);
    return regex.test(basename) || normalizedPath.split("/").some((segment) => regex.test(segment));
  }
  return [normalizedPattern, normalizedPattern.replaceAll("**/", "")].some((candidate) =>
    globToRegex(candidate).test(normalizedPath),
  );
};

const matchesAnyGlob = (relativePath: string, patterns: ReadonlyArray<string>): boolean =>
  patterns.some((pattern) => matchesGlob(relativePath, pattern));

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
        pattern: directoryOnly ? rawPattern.slice(0, -1) : rawPattern,
        negated,
        directoryOnly,
      };
    });

const isIgnoredByGitignore = (
  relativePath: string,
  isDirectory: boolean,
  patterns: ReadonlyArray<IgnorePattern>,
): boolean => {
  const normalizedPath = normalizeRelativePath(relativePath);
  let ignored = false;
  for (const pattern of patterns) {
    const matched = pattern.directoryOnly
      ? isDirectory
        ? matchesGlob(normalizedPath, pattern.pattern) ||
          normalizedPath.startsWith(`${pattern.pattern}/`)
        : normalizedPath.startsWith(`${pattern.pattern}/`)
      : matchesGlob(normalizedPath, pattern.pattern);
    if (matched) ignored = !pattern.negated;
  }
  return ignored;
};

const shouldIncludePath = (relativePath: string, options: ResolvedFileIndexOptions): boolean =>
  (options.include.length === 0 || matchesAnyGlob(relativePath, options.include)) &&
  !matchesAnyGlob(relativePath, options.exclude);

const stringProperty = (value: unknown, key: string): Option.Option<string> => {
  if (typeof value !== "object" || value === null) return Option.none();
  if (!(key in value)) return Option.none();
  const property = Object.entries(value).find(([entryKey]) => entryKey === key)?.[1];
  return typeof property === "string" && property.trim() !== ""
    ? Option.some(property.trim())
    : Option.none();
};

const firstSome = (values: ReadonlyArray<Option.Option<string>>): Option.Option<string> => {
  for (const value of values) {
    if (Option.isSome(value)) return value;
  }
  return Option.none();
};

const descriptorFromMarkdown = (content: string): Option.Option<string> => {
  const heading = content
    .split(/\r?\n/)
    .map((line) => headingPattern.exec(line)?.[2]?.trim())
    .find((text) => text !== undefined && text !== "");
  return heading === undefined ? Option.none() : Option.some(heading);
};

const descriptorFromJson = (content: string): Option.Option<string> =>
  firstSome([
    stringProperty(parseJson(content), "description"),
    stringProperty(parseJson(content), "summary"),
    stringProperty(parseJson(content), "name"),
  ]);

const parseJson = (content: string): unknown => {
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
};

const descriptorFromKeyValue = (content: string): Option.Option<string> => {
  const match = /^(?:description|summary|title)\s*[:=]\s*["']?(.+?)["']?\s*$/m.exec(content);
  const descriptor = match?.[1]?.trim();
  return descriptor === undefined || descriptor === "" ? Option.none() : Option.some(descriptor);
};

const extractDescriptor = (filePath: string, content: string): Option.Option<string> => {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".mdx")) return descriptorFromMarkdown(content);
  if (lower.endsWith(".json") || lower.endsWith(".jsonc")) return descriptorFromJson(content);
  if (lower.endsWith(".yaml") || lower.endsWith(".yml") || lower.endsWith(".toml")) {
    return descriptorFromKeyValue(content);
  }
  return Option.none();
};

const readDescriptor = (
  filePath: string,
  options: ResolvedFileIndexOptions,
): Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    if (!options.descriptors) return Option.none();
    const fs = yield* FileSystem.FileSystem;
    const content = yield* fs.readFileString(filePath).pipe(Effect.option);
    return Option.match(content, {
      onNone: () => Option.none(),
      onSome: (value) => extractDescriptor(filePath, value),
    });
  });

const readRootGitignore = (
  root: string,
): Effect.Effect<ReadonlyArray<IgnorePattern>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const content = yield* fs.readFileString(path.join(root, ".gitignore")).pipe(Effect.option);
    return Option.match(content, {
      onNone: () => [],
      onSome: parseGitignore,
    });
  });

const scanFiles = (
  root: string,
  current: string,
  depth: number,
  options: ResolvedFileIndexOptions,
): Effect.Effect<ReadonlyArray<FileIndexEntry>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    if (depth > options.maxDepth) return [];
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* fs.readDirectory(current).pipe(Effect.catch(() => Effect.succeed([])));
    const sorted = [...entries].sort((a, b) => a.localeCompare(b));
    const nested = yield* Effect.forEach(
      sorted,
      (entry) =>
        Effect.gen(function* () {
          if (shouldSkipEntry(entry, options.includeHidden))
            return [] satisfies ReadonlyArray<FileIndexEntry>;
          const absolute = path.join(current, entry);
          const stat = yield* fs.stat(absolute).pipe(Effect.option);
          if (Option.isNone(stat)) return [] satisfies ReadonlyArray<FileIndexEntry>;
          const relativePath = normalizeRelativePath(path.relative(root, absolute));
          if (
            options.respectGitignore &&
            isIgnoredByGitignore(relativePath, stat.value.type === "Directory", options.gitignore)
          ) {
            return [] satisfies ReadonlyArray<FileIndexEntry>;
          }
          if (stat.value.type === "Directory") {
            return yield* scanFiles(root, absolute, depth + 1, options);
          }
          if (!shouldIncludePath(relativePath, options))
            return [] satisfies ReadonlyArray<FileIndexEntry>;
          const descriptor = yield* readDescriptor(absolute, options);
          return [{ path: relativePath, descriptor }] satisfies ReadonlyArray<FileIndexEntry>;
        }),
      { concurrency: 1 },
    );
    return nested.flat();
  });

const renderEntryLabel = (entry: FileIndexEntry): string =>
  Option.match(entry.descriptor, {
    onNone: () => entry.path,
    onSome: (descriptor) => `${entry.path} - ${descriptor}`,
  });

const renderList = (files: ReadonlyArray<FileIndexEntry>): string =>
  files.map((file) => `- ${renderEntryLabel(file)}`).join("\n");

const renderTree = (files: ReadonlyArray<FileIndexEntry>): string =>
  files
    .map((entry) => {
      const segments = entry.path.split(/[\\/]/);
      const depth = segments.length - 1;
      const basename = segments.at(-1) ?? entry.path;
      const label = Option.match(entry.descriptor, {
        onNone: () => basename,
        onSome: (descriptor) => `${basename} - ${descriptor}`,
      });
      return `${"  ".repeat(depth)}- ${label}`;
    })
    .join("\n");

export const generateFileIndex = (
  workspaceRoot: string,
  options: FileIndexOptions = {},
): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const gitignore =
      options.respectGitignore === false ? [] : yield* readRootGitignore(workspaceRoot);
    const resolved = {
      maxDepth: options.maxDepth ?? 5,
      format: options.format ?? "list",
      includeHidden: options.includeHidden ?? false,
      include: options.include ?? [],
      exclude: options.exclude ?? [],
      respectGitignore: options.respectGitignore ?? true,
      descriptors: options.descriptors ?? false,
      gitignore,
    };
    const files = yield* scanFiles(workspaceRoot, workspaceRoot, 0, resolved);
    return resolved.format === "tree" ? renderTree(files) : renderList(files);
  });

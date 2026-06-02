/**
 * Built-in generated content sources for files packages.
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

export type FileIndexFormat = "list" | "tree" | "table";

export type FileIndexColumn = "path" | "fileName" | "link" | "title" | "description";

export const FILE_INDEX_COLUMNS: ReadonlyArray<FileIndexColumn> = [
  "path",
  "fileName",
  "link",
  "title",
  "description",
];

const FILE_INDEX_COLUMN_SET: ReadonlySet<string> = new Set<string>(FILE_INDEX_COLUMNS);

export const isFileIndexColumn = (value: string): value is FileIndexColumn =>
  FILE_INDEX_COLUMN_SET.has(value);

export interface FileIndexOptions {
  readonly maxDepth?: number | undefined;
  readonly format?: FileIndexFormat | undefined;
  readonly includeHidden?: boolean | undefined;
  readonly include?: ReadonlyArray<string> | undefined;
  readonly exclude?: ReadonlyArray<string> | undefined;
  readonly respectGitignore?: boolean | undefined;
  readonly columns?: ReadonlyArray<FileIndexColumn> | undefined;
}

interface ResolvedFileIndexOptions {
  readonly maxDepth: number;
  readonly format: FileIndexFormat;
  readonly includeHidden: boolean;
  readonly include: ReadonlyArray<string>;
  readonly exclude: ReadonlyArray<string>;
  readonly respectGitignore: boolean;
  readonly columns: ReadonlyArray<FileIndexColumn>;
  readonly readsContent: boolean;
  readonly gitignore: ReadonlyArray<IgnorePattern>;
}

interface FileIndexEntry {
  readonly path: string;
  readonly title: Option.Option<string>;
  readonly description: Option.Option<string>;
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

const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

const matchKeyValue = (content: string, key: string): Option.Option<string> => {
  const pattern = new RegExp(`^${key}\\s*[:=]\\s*["']?(.+?)["']?\\s*$`, "m");
  const match = pattern.exec(content);
  const value = match?.[1]?.trim();
  return value === undefined || value === "" ? Option.none() : Option.some(value);
};

const markdownFrontmatter = (content: string): Option.Option<string> => {
  const match = frontmatterPattern.exec(content);
  return match?.[1] === undefined ? Option.none() : Option.some(match[1]);
};

const markdownFirstHeading = (content: string): Option.Option<string> => {
  const heading = content
    .split(/\r?\n/)
    .map((line) => headingPattern.exec(line)?.[2]?.trim())
    .find((text) => text !== undefined && text !== "");
  return heading === undefined ? Option.none() : Option.some(heading);
};

const titleFromMarkdown = (content: string): Option.Option<string> => {
  const frontmatter = markdownFrontmatter(content);
  const fromFrontmatter = Option.isSome(frontmatter)
    ? matchKeyValue(frontmatter.value, "title")
    : Option.none<string>();
  return Option.isSome(fromFrontmatter) ? fromFrontmatter : markdownFirstHeading(content);
};

const descriptionFromMarkdown = (content: string): Option.Option<string> => {
  const frontmatter = markdownFrontmatter(content);
  if (Option.isNone(frontmatter)) return Option.none();
  return firstSome([
    matchKeyValue(frontmatter.value, "description"),
    matchKeyValue(frontmatter.value, "summary"),
  ]);
};

const titleFromJson = (content: string): Option.Option<string> =>
  stringProperty(parseJson(content), "name");

const descriptionFromJson = (content: string): Option.Option<string> =>
  firstSome([
    stringProperty(parseJson(content), "description"),
    stringProperty(parseJson(content), "summary"),
  ]);

const parseJson = (content: string): unknown => {
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
};

const titleFromKeyValue = (content: string): Option.Option<string> =>
  matchKeyValue(content, "title");

const descriptionFromKeyValue = (content: string): Option.Option<string> =>
  firstSome([matchKeyValue(content, "description"), matchKeyValue(content, "summary")]);

const extractTitle = (filePath: string, content: string): Option.Option<string> => {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".mdx")) return titleFromMarkdown(content);
  if (lower.endsWith(".json") || lower.endsWith(".jsonc")) return titleFromJson(content);
  if (lower.endsWith(".yaml") || lower.endsWith(".yml") || lower.endsWith(".toml")) {
    return titleFromKeyValue(content);
  }
  return Option.none();
};

const extractDescription = (filePath: string, content: string): Option.Option<string> => {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".mdx")) return descriptionFromMarkdown(content);
  if (lower.endsWith(".json") || lower.endsWith(".jsonc")) return descriptionFromJson(content);
  if (lower.endsWith(".yaml") || lower.endsWith(".yml") || lower.endsWith(".toml")) {
    return descriptionFromKeyValue(content);
  }
  return Option.none();
};

const readEntryMetadata = (
  filePath: string,
  options: ResolvedFileIndexOptions,
): Effect.Effect<
  { readonly title: Option.Option<string>; readonly description: Option.Option<string> },
  never,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    if (!options.readsContent) {
      return { title: Option.none(), description: Option.none() };
    }
    const fs = yield* FileSystem.FileSystem;
    const content = yield* fs.readFileString(filePath).pipe(Effect.option);
    return Option.match(content, {
      onNone: () => ({ title: Option.none<string>(), description: Option.none<string>() }),
      onSome: (value) => ({
        title: extractTitle(filePath, value),
        description: extractDescription(filePath, value),
      }),
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
          const metadata = yield* readEntryMetadata(absolute, options);
          return [
            { path: relativePath, title: metadata.title, description: metadata.description },
          ] satisfies ReadonlyArray<FileIndexEntry>;
        }),
      { concurrency: 1 },
    );
    return nested.flat();
  });

const columnLabel: Record<FileIndexColumn, string> = {
  path: "Path",
  fileName: "File",
  link: "Link",
  title: "Title",
  description: "Description",
};

const basenameOf = (path: string): string => path.split("/").at(-1) ?? path;

const columnValue = (entry: FileIndexEntry, column: FileIndexColumn): string => {
  switch (column) {
    case "path":
      return entry.path;
    case "fileName":
      return basenameOf(entry.path);
    case "link":
      return `[${basenameOf(entry.path)}](${entry.path})`;
    case "title":
      return Option.getOrElse(entry.title, () => "");
    case "description":
      return Option.getOrElse(entry.description, () => "");
  }
};

const escapeTableCell = (value: string): string =>
  value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

const joinListColumns = (entry: FileIndexEntry, columns: ReadonlyArray<FileIndexColumn>): string =>
  columns
    .map((column) => columnValue(entry, column))
    .filter((value, index) => index === 0 || value !== "")
    .join(" - ");

const renderList = (
  files: ReadonlyArray<FileIndexEntry>,
  columns: ReadonlyArray<FileIndexColumn>,
): string => files.map((file) => `- ${joinListColumns(file, columns)}`).join("\n");

const renderTree = (
  files: ReadonlyArray<FileIndexEntry>,
  columns: ReadonlyArray<FileIndexColumn>,
): string => {
  const treeColumns: ReadonlyArray<FileIndexColumn> =
    columns[0] === "path" ? ["fileName", ...columns.slice(1)] : columns;
  return files
    .map((entry) => {
      const depth = entry.path.split("/").length - 1;
      return `${"  ".repeat(depth)}- ${joinListColumns(entry, treeColumns)}`;
    })
    .join("\n");
};

const renderTable = (
  files: ReadonlyArray<FileIndexEntry>,
  columns: ReadonlyArray<FileIndexColumn>,
): string => {
  const header = `| ${columns.map((column) => columnLabel[column]).join(" | ")} |`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |`;
  const rows = files.map(
    (file) =>
      `| ${columns.map((column) => escapeTableCell(columnValue(file, column))).join(" | ")} |`,
  );
  return [header, separator, ...rows].join("\n");
};

const defaultColumns = (format: FileIndexFormat): ReadonlyArray<FileIndexColumn> => {
  switch (format) {
    case "table":
      return ["path", "description"];
    case "tree":
      return ["fileName"];
    case "list":
      return ["path"];
  }
};

export const generateFileIndex = (
  workspaceRoot: string,
  options: FileIndexOptions = {},
): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const gitignore =
      options.respectGitignore === false ? [] : yield* readRootGitignore(workspaceRoot);
    const format: FileIndexFormat = options.format ?? "list";
    const columns =
      options.columns !== undefined && options.columns.length > 0
        ? options.columns
        : defaultColumns(format);
    const readsContent = columns.some((column) => column === "title" || column === "description");
    const resolved: ResolvedFileIndexOptions = {
      maxDepth: options.maxDepth ?? 5,
      format,
      includeHidden: options.includeHidden ?? false,
      include: options.include ?? [],
      exclude: options.exclude ?? [],
      respectGitignore: options.respectGitignore ?? true,
      columns,
      readsContent,
      gitignore,
    };
    const files = yield* scanFiles(workspaceRoot, workspaceRoot, 0, resolved);
    switch (resolved.format) {
      case "table":
        return renderTable(files, resolved.columns);
      case "tree":
        return renderTree(files, resolved.columns);
      case "list":
        return renderList(files, resolved.columns);
    }
  });

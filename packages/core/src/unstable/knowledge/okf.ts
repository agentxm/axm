/** Open Knowledge Format 0.1 draft discovery and AgentXM-profile validation. */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import { parseFrontmatterEffect } from "../extensions/frontmatter.js";

export interface KnowledgeConcept {
  readonly id: string;
  readonly title: string;
  readonly type?: string;
  readonly description?: string;
  readonly tags?: ReadonlyArray<string>;
  readonly resource?: string;
  readonly timestamp?: string;
  readonly relativePath: string;
  readonly body: string;
}

export interface KnowledgeDiagnostic {
  readonly code:
    | "bundle-too-large"
    | "file-too-large"
    | "invalid-tags"
    | "missing-root-index"
    | "missing-okf-version"
    | "missing-title"
    | "missing-description"
    | "missing-tags"
    | "symbolic-link"
    | "too-many-files"
    | "unsupported-okf-version"
    | "missing-type"
    | "invalid-frontmatter"
    | "case-collision"
    | "dangerous-uri"
    | "detected-secret"
    | "unsafe-path"
    | "invalid-index"
    | "invalid-log"
    | "invalid-resource"
    | "invalid-timestamp"
    | "broken-internal-link"
    | "escaping-link"
    | "unreachable-concept"
    | "missing-index-entry"
    | "stale-index-entry"
    | "embedded-html"
    | "malformed-citation"
    | "duplicate-resource"
    | "inconsistent-type"
    | "large-concept"
    | "large-index"
    | "unreferenced-asset";
  readonly severity: "error" | "warning";
  readonly relativePath: string;
  readonly line?: number;
  readonly message: string;
}

export interface KnowledgeInspection {
  readonly concepts: ReadonlyArray<KnowledgeConcept>;
  readonly diagnostics: ReadonlyArray<KnowledgeDiagnostic>;
}

const RESERVED_BASENAMES = new Set(["index.md", "log.md"]);
const MAX_FILE_BYTES = 1024n * 1024n;
const MAX_BUNDLE_BYTES = 10n * 1024n * 1024n;
const MAX_BUNDLE_FILES = 1_000;
const LARGE_CONCEPT_BYTES = 128n * 1024n;
const LARGE_INDEX_BYTES = 256n * 1024n;
export interface KnowledgeBundleEntry {
  readonly relativePath: string;
  readonly type: FileSystem.File.Type;
  readonly size: bigint;
}

const bundleEntries = (
  root: string,
  current: string,
): Effect.Effect<ReadonlyArray<KnowledgeBundleEntry>, unknown, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = [...(yield* fs.readDirectory(current))].sort();
    const files: KnowledgeBundleEntry[] = [];
    for (const entry of entries) {
      const absolute = path.join(current, entry);
      const stat = yield* fs.stat(absolute);
      if (stat.type === "Directory") {
        files.push(...(yield* bundleEntries(root, absolute)));
      } else {
        files.push({
          relativePath: path.relative(root, absolute).replace(/\\/g, "/"),
          type: stat.type,
          size: stat.size,
        });
      }
    }
    return files;
  });

const firstHeading = (body: string): string | undefined => {
  for (const line of body.split(/\r?\n/)) {
    const match = /^#\s+(.+?)\s*$/.exec(line);
    if (match?.[1] !== undefined) return match[1];
  }
  return undefined;
};

const conceptId = (relativePath: string): string => relativePath.replace(/\.md$/i, "");

interface MarkdownLink {
  readonly target: string;
  readonly line: number;
}

const markdownLinks = (body: string): ReadonlyArray<MarkdownLink> => {
  const links: MarkdownLink[] = [];
  const pattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  for (const match of body.matchAll(pattern)) {
    const target = match[1];
    if (target === undefined) continue;
    const offset = match.index ?? 0;
    links.push({
      target,
      line: body.slice(0, offset).split(/\r?\n/).length,
    });
  }
  return links;
};

const metadataField = (metadata: unknown, key: string): unknown => {
  if (typeof metadata !== "object" || metadata === null) return undefined;
  return Object.entries(metadata).find(([entryKey]) => entryKey === key)?.[1];
};

const normalizedPath = (
  sourcePath: string,
  target: string,
): { readonly path: string; readonly escaped: boolean } | null => {
  const pathOnly = (target.split("#", 1)[0] ?? "").split("?", 1)[0] ?? "";
  if (pathOnly.length === 0 || pathOnly.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(pathOnly)) {
    return null;
  }
  const decoded = (() => {
    try {
      return decodeURIComponent(pathOnly);
    } catch {
      return pathOnly;
    }
  })();
  const sourceSegments = sourcePath.split("/").slice(0, -1);
  const segments = decoded.startsWith("/")
    ? decoded.slice(1).split("/")
    : [...sourceSegments, ...decoded.split("/")];
  const resolved: string[] = [];
  let escaped = false;
  for (const segment of segments) {
    if (segment.length === 0 || segment === ".") continue;
    if (segment === "..") {
      if (resolved.length === 0) escaped = true;
      else resolved.pop();
    } else {
      resolved.push(segment);
    }
  }
  return { path: resolved.join("/"), escaped };
};

const activeScheme = (target: string): boolean =>
  /^(?:javascript|vbscript|data):/i.test(target.trim());

const validIsoTimestamp = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
  !Number.isNaN(Date.parse(value));

const validResource = (value: string): boolean => {
  if (activeScheme(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol.length > 1;
  } catch {
    return false;
  }
};

const secretPatterns: ReadonlyArray<RegExp> = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/,
  /\b(?:sk_live|rk_live)_[A-Za-z0-9]{20,}\b/,
];

const secretLine = (raw: string): number | undefined => {
  const lines = raw.split(/\r?\n/);
  const index = lines.findIndex((line) => secretPatterns.some((pattern) => pattern.test(line)));
  return index === -1 ? undefined : index + 1;
};

const isReserved = (relativePath: string): boolean => {
  const baseName = relativePath.replace(/\\/g, "/").split("/").at(-1)?.toLowerCase();
  return baseName !== undefined && RESERVED_BASENAMES.has(baseName);
};

const resolvedMarkdownTarget = (
  sourcePath: string,
  target: string,
  markdownPaths: ReadonlySet<string>,
): { readonly path: string; readonly escaped: boolean } | null => {
  const normalized = normalizedPath(sourcePath, target);
  if (normalized === null || normalized.escaped) return normalized;
  const candidates = normalized.path.toLowerCase().endsWith(".md")
    ? [normalized.path]
    : [normalized.path, `${normalized.path}.md`, `${normalized.path}/index.md`];
  return {
    path:
      candidates.find((candidate) => markdownPaths.has(candidate)) ??
      candidates[0] ??
      normalized.path,
    escaped: false,
  };
};

/**
 * Inspect an OKF bundle. The root index requirement is an explicit AgentXM
 * profile constraint; upstream OKF 0.1 itself permits a root without it.
 */
export const inspectKnowledgeEntries = <E>(
  entries: ReadonlyArray<KnowledgeBundleEntry>,
  readMarkdown: (relativePath: string) => Effect.Effect<string, E>,
): Effect.Effect<KnowledgeInspection, E> =>
  Effect.gen(function* () {
    const files = entries
      .filter((entry) => entry.type === "File" && entry.relativePath.toLowerCase().endsWith(".md"))
      .map((entry) => entry.relativePath)
      .sort((left, right) => left.localeCompare(right));
    const markdownPaths = new Set(files);
    const allFilePaths = new Set(
      entries.filter((entry) => entry.type === "File").map((entry) => entry.relativePath),
    );
    const diagnostics: KnowledgeDiagnostic[] = [];
    const concepts: KnowledgeConcept[] = [];
    const linksByPath = new Map<string, ReadonlyArray<MarkdownLink>>();
    const resources = new Map<string, string[]>();
    const types = new Map<string, Set<string>>();
    if (entries.length > MAX_BUNDLE_FILES) {
      diagnostics.push({
        code: "too-many-files",
        severity: "error",
        relativePath: ".",
        message: `Knowledge bundle contains ${entries.length} files; the safety limit is ${MAX_BUNDLE_FILES}.`,
      });
    }
    const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0n);
    if (totalBytes > MAX_BUNDLE_BYTES) {
      diagnostics.push({
        code: "bundle-too-large",
        severity: "error",
        relativePath: ".",
        message: "Knowledge bundle exceeds the 10 MiB uncompressed safety limit.",
      });
    }
    const pathsByCase = new Map<string, string[]>();
    for (const entry of entries) {
      const segments = entry.relativePath.split("/");
      if (
        entry.relativePath.startsWith("/") ||
        entry.relativePath.includes("\\") ||
        entry.relativePath.includes("\0") ||
        segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
      ) {
        diagnostics.push({
          code: "unsafe-path",
          severity: "error",
          relativePath: entry.relativePath,
          message: `${entry.relativePath} is not a safe bundle-relative path.`,
        });
      }
      const folded = entry.relativePath.normalize("NFC").toLocaleLowerCase();
      const colliding = pathsByCase.get(folded) ?? [];
      colliding.push(entry.relativePath);
      pathsByCase.set(folded, colliding);
      if (entry.type === "SymbolicLink") {
        diagnostics.push({
          code: "symbolic-link",
          severity: "error",
          relativePath: entry.relativePath,
          message: `${entry.relativePath} is a symbolic link; knowledge bundles must be self-contained.`,
        });
      }
      if (entry.size > MAX_FILE_BYTES) {
        diagnostics.push({
          code: "file-too-large",
          severity: "error",
          relativePath: entry.relativePath,
          message: `${entry.relativePath} exceeds the 1 MiB per-file safety limit.`,
        });
      }
      if (
        entry.type === "File" &&
        entry.relativePath.toLowerCase().endsWith(".md") &&
        isReserved(entry.relativePath) &&
        entry.relativePath.toLowerCase().endsWith("index.md") &&
        entry.size > LARGE_INDEX_BYTES
      ) {
        diagnostics.push({
          code: "large-index",
          severity: "warning",
          relativePath: entry.relativePath,
          message: `${entry.relativePath} is unusually large for progressive discovery.`,
        });
      } else if (
        entry.type === "File" &&
        entry.relativePath.toLowerCase().endsWith(".md") &&
        entry.size > LARGE_CONCEPT_BYTES
      ) {
        diagnostics.push({
          code: "large-concept",
          severity: "warning",
          relativePath: entry.relativePath,
          message: `${entry.relativePath} is unusually large and may be expensive to consume.`,
        });
      }
    }
    for (const colliding of pathsByCase.values()) {
      if (new Set(colliding).size > 1) {
        diagnostics.push({
          code: "case-collision",
          severity: "error",
          relativePath: colliding[0] ?? ".",
          message: `Bundle paths collide on case-insensitive filesystems: ${colliding.join(", ")}.`,
        });
      }
    }
    if (!files.includes("index.md")) {
      diagnostics.push({
        code: "missing-root-index",
        severity: "error",
        relativePath: "index.md",
        message: "AgentXM knowledge bundles require src/index.md as their discovery root.",
      });
    }

    for (const relativePath of files) {
      const raw = yield* readMarkdown(relativePath);
      const links = markdownLinks(raw);
      linksByPath.set(relativePath, links);
      const foundSecretLine = secretLine(raw);
      if (foundSecretLine !== undefined) {
        diagnostics.push({
          code: "detected-secret",
          severity: "error",
          relativePath,
          line: foundSecretLine,
          message: `${relativePath} contains a high-confidence credential or private key pattern.`,
        });
      }
      for (const link of links) {
        if (activeScheme(link.target)) {
          diagnostics.push({
            code: "dangerous-uri",
            severity: "error",
            relativePath,
            line: link.line,
            message: `${relativePath} contains a dangerous active URI scheme.`,
          });
        }
      }
      const activeHtmlUri = /\b(?:href|src)\s*=\s*["']\s*(?:javascript|vbscript|data):/i.exec(raw);
      if (activeHtmlUri !== null) {
        diagnostics.push({
          code: "dangerous-uri",
          severity: "error",
          relativePath,
          line: raw.slice(0, activeHtmlUri.index).split(/\r?\n/).length,
          message: `${relativePath} contains a dangerous active URI scheme.`,
        });
      }
      if (/<\/?(?:script|iframe|object|embed|form|style|video|audio|svg|math)\b[^>]*>/i.test(raw)) {
        diagnostics.push({
          code: "embedded-html",
          severity: "warning",
          relativePath,
          message: `${relativePath} contains embedded HTML; consumers must sanitize it.`,
        });
      }
      const parsed = yield* parseFrontmatterEffect(raw).pipe(Effect.option);
      if (Option.isNone(parsed)) {
        diagnostics.push({
          code: "invalid-frontmatter",
          severity: "error",
          relativePath,
          message: `${relativePath} contains invalid YAML frontmatter.`,
        });
        continue;
      }
      const baseName = (
        relativePath.replace(/\\/g, "/").split("/").at(-1) ?? relativePath
      ).toLowerCase();
      const metadata = parsed.value.frontmatter;
      const isMetadata = typeof metadata === "object" && metadata !== null;
      if (baseName === "index.md") {
        if (relativePath !== "index.md" && metadata !== undefined) {
          diagnostics.push({
            code: "invalid-index",
            severity: "error",
            relativePath,
            message: `${relativePath} is a reserved index and must not contain frontmatter.`,
          });
        }
        if (firstHeading(parsed.value.body) === undefined) {
          diagnostics.push({
            code: "invalid-index",
            severity: "error",
            relativePath,
            message: `${relativePath} must contain at least one level-one section heading.`,
          });
        }
      }
      if (baseName === "log.md") {
        if (metadata !== undefined) {
          diagnostics.push({
            code: "invalid-log",
            severity: "error",
            relativePath,
            message: `${relativePath} is a reserved log and must not contain frontmatter.`,
          });
        }
        const dateHeadings = parsed.value.body
          .split(/\r?\n/)
          .map((line, index) => ({ line, number: index + 1 }))
          .filter(({ line }) => /^##\s+/.test(line));
        if (
          dateHeadings.some(({ line }) => !/^##\s+\d{4}-\d{2}-\d{2}\s*$/.test(line)) ||
          dateHeadings.some(({ line }) => {
            const value = line.replace(/^##\s+/, "").trim();
            const parsedDate = Date.parse(`${value}T00:00:00Z`);
            return Number.isNaN(parsedDate);
          })
        ) {
          const invalid = dateHeadings.find(
            ({ line }) => !/^##\s+\d{4}-\d{2}-\d{2}\s*$/.test(line),
          );
          diagnostics.push({
            code: "invalid-log",
            severity: "error",
            relativePath,
            ...(invalid === undefined ? {} : { line: invalid.number }),
            message: `${relativePath} date headings must use valid ISO 8601 YYYY-MM-DD dates.`,
          });
        }
        const dates = dateHeadings.map(({ line }) => line.replace(/^##\s+/, "").trim());
        if (dates.some((date, index) => index > 0 && date > (dates[index - 1] ?? date))) {
          diagnostics.push({
            code: "invalid-log",
            severity: "error",
            relativePath,
            message: `${relativePath} date headings must be newest first.`,
          });
        }
      }
      const type =
        isMetadata &&
        "type" in metadata &&
        typeof metadata.type === "string" &&
        metadata.type.length > 0
          ? metadata.type
          : undefined;
      const description =
        isMetadata && "description" in metadata && typeof metadata.description === "string"
          ? metadata.description
          : undefined;
      const tags =
        isMetadata &&
        "tags" in metadata &&
        Array.isArray(metadata.tags) &&
        metadata.tags.every((tag) => typeof tag === "string")
          ? metadata.tags
          : undefined;
      const resourceValue = metadataField(metadata, "resource");
      const resource = typeof resourceValue === "string" ? resourceValue : undefined;
      const timestampValue = metadataField(metadata, "timestamp");
      const timestamp = typeof timestampValue === "string" ? timestampValue : undefined;
      if (isMetadata && "tags" in metadata && metadata.tags !== undefined && tags === undefined) {
        diagnostics.push({
          code: "invalid-tags",
          severity: "error",
          relativePath,
          message: `${relativePath} tags must be an array of strings.`,
        });
      }
      if (relativePath === "index.md") {
        const okfVersion =
          isMetadata && "okf_version" in metadata ? metadata.okf_version : undefined;
        if (okfVersion === undefined) {
          diagnostics.push({
            code: "missing-okf-version",
            severity: "error",
            relativePath,
            message: "src/index.md requires okf_version: 0.1 in YAML frontmatter.",
          });
        } else if (String(okfVersion) !== "0.1") {
          diagnostics.push({
            code: "unsupported-okf-version",
            severity: "error",
            relativePath,
            message: `Unsupported OKF version ${String(okfVersion)}; expected 0.1.`,
          });
        }
      }
      if (
        !RESERVED_BASENAMES.has(baseName) &&
        resourceValue !== undefined &&
        (resource === undefined || !validResource(resource))
      ) {
        diagnostics.push({
          code: "invalid-resource",
          severity: "error",
          relativePath,
          message: `${relativePath} resource must be a safe absolute URI.`,
        });
      }
      if (
        !RESERVED_BASENAMES.has(baseName) &&
        timestampValue !== undefined &&
        (timestamp === undefined || !validIsoTimestamp(timestamp))
      ) {
        diagnostics.push({
          code: "invalid-timestamp",
          severity: "error",
          relativePath,
          message: `${relativePath} timestamp must be an ISO 8601 date-time with a timezone.`,
        });
      }
      if (!RESERVED_BASENAMES.has(baseName) && type === undefined) {
        diagnostics.push({
          code: "missing-type",
          severity: "error",
          relativePath,
          message: `${relativePath} is an OKF concept and requires a non-empty frontmatter type.`,
        });
      }
      const title = firstHeading(parsed.value.body);
      if (title === undefined) {
        diagnostics.push({
          code: "missing-title",
          severity: "warning",
          relativePath,
          message: `${relativePath} should include one level-one heading for a stable display title.`,
        });
      }
      if (!RESERVED_BASENAMES.has(baseName) && description === undefined) {
        diagnostics.push({
          code: "missing-description",
          severity: "warning",
          relativePath,
          message: `${relativePath} should include a concise frontmatter description.`,
        });
      }
      if (!RESERVED_BASENAMES.has(baseName) && tags === undefined) {
        diagnostics.push({
          code: "missing-tags",
          severity: "warning",
          relativePath,
          message: `${relativePath} should include frontmatter tags for discovery.`,
        });
      }
      if (!RESERVED_BASENAMES.has(baseName) && resource !== undefined && validResource(resource)) {
        const matching = resources.get(resource) ?? [];
        matching.push(relativePath);
        resources.set(resource, matching);
      }
      if (!RESERVED_BASENAMES.has(baseName) && type !== undefined) {
        const spellings = types.get(type.toLocaleLowerCase()) ?? new Set<string>();
        spellings.add(type);
        types.set(type.toLocaleLowerCase(), spellings);
      }
      const citationHeading = parsed.value.body.search(/^#\s+Citations\s*$/im);
      if (citationHeading >= 0) {
        const citationBody = parsed.value.body.slice(citationHeading).split(/\r?\n/).slice(1);
        const malformedIndex = citationBody.findIndex(
          (line) => /^\s*\[\d+\]/.test(line) && !/^\s*\[\d+\]\s+\[[^\]]+\]\([^)]+\)/.test(line),
        );
        if (malformedIndex >= 0) {
          diagnostics.push({
            code: "malformed-citation",
            severity: "warning",
            relativePath,
            line:
              parsed.value.body.slice(0, citationHeading).split(/\r?\n/).length +
              malformedIndex +
              2,
            message: `${relativePath} contains a malformed numbered citation.`,
          });
        }
      }
      concepts.push({
        id: conceptId(relativePath),
        title: title ?? conceptId(relativePath),
        ...(type === undefined ? {} : { type }),
        ...(description === undefined ? {} : { description }),
        ...(tags === undefined ? {} : { tags }),
        ...(resource === undefined ? {} : { resource }),
        ...(timestamp === undefined ? {} : { timestamp }),
        relativePath,
        body: parsed.value.body,
      });
    }

    const outgoing = new Map<string, Set<string>>();
    const referencedFiles = new Set<string>();
    for (const [sourcePath, links] of linksByPath) {
      const targets = new Set<string>();
      for (const link of links) {
        const normalized = normalizedPath(sourcePath, link.target);
        if (normalized === null) continue;
        if (normalized.escaped) {
          diagnostics.push({
            code: "escaping-link",
            severity: "warning",
            relativePath: sourcePath,
            line: link.line,
            message: `${sourcePath} links outside the Knowledge bundle.`,
          });
          continue;
        }
        const resolved = resolvedMarkdownTarget(sourcePath, link.target, markdownPaths);
        const targetPath = resolved?.path ?? normalized.path;
        if (allFilePaths.has(targetPath)) referencedFiles.add(targetPath);
        if (markdownPaths.has(targetPath)) {
          targets.add(targetPath);
        } else if (!allFilePaths.has(targetPath)) {
          diagnostics.push({
            code: sourcePath.toLowerCase().endsWith("index.md")
              ? "stale-index-entry"
              : "broken-internal-link",
            severity: "warning",
            relativePath: sourcePath,
            line: link.line,
            message: `${sourcePath} links to missing bundle path ${link.target}.`,
          });
        }
      }
      outgoing.set(sourcePath, targets);
    }

    const reachable = new Set<string>();
    const hasRootIndex = files.includes("index.md");
    const pending = hasRootIndex ? ["index.md"] : [];
    while (pending.length > 0) {
      const current = pending.shift();
      if (current === undefined || reachable.has(current)) continue;
      reachable.add(current);
      for (const target of outgoing.get(current) ?? []) pending.push(target);
    }
    for (const concept of concepts) {
      if (
        hasRootIndex &&
        !isReserved(concept.relativePath) &&
        !reachable.has(concept.relativePath)
      ) {
        diagnostics.push({
          code: "unreachable-concept",
          severity: "warning",
          relativePath: concept.relativePath,
          message: `${concept.relativePath} is not reachable from the root index.`,
        });
      }
      if (!isReserved(concept.relativePath)) {
        const directory = concept.relativePath.split("/").slice(0, -1).join("/");
        const nearestIndex = directory.length === 0 ? "index.md" : `${directory}/index.md`;
        if (
          markdownPaths.has(nearestIndex) &&
          !(outgoing.get(nearestIndex) ?? new Set<string>()).has(concept.relativePath)
        ) {
          diagnostics.push({
            code: "missing-index-entry",
            severity: "warning",
            relativePath: nearestIndex,
            message: `${nearestIndex} does not link to ${concept.relativePath}.`,
          });
        }
      }
    }
    for (const entry of entries) {
      if (
        entry.type === "File" &&
        !entry.relativePath.toLowerCase().endsWith(".md") &&
        !referencedFiles.has(entry.relativePath)
      ) {
        diagnostics.push({
          code: "unreferenced-asset",
          severity: "warning",
          relativePath: entry.relativePath,
          message: `${entry.relativePath} is not referenced by any Markdown document.`,
        });
      }
    }
    for (const [resource, matching] of resources) {
      if (matching.length > 1) {
        for (const relativePath of matching) {
          diagnostics.push({
            code: "duplicate-resource",
            severity: "warning",
            relativePath,
            message: `${relativePath} shares canonical resource ${resource} with another concept.`,
          });
        }
      }
    }
    for (const spellings of types.values()) {
      if (spellings.size > 1) {
        diagnostics.push({
          code: "inconsistent-type",
          severity: "warning",
          relativePath: ".",
          message: `Concept type spellings differ only by casing: ${[...spellings].sort().join(", ")}.`,
        });
      }
    }
    return { concepts, diagnostics };
  });

export const inspectKnowledgeBundle = (
  sourceRoot: string,
): Effect.Effect<KnowledgeInspection, unknown, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* bundleEntries(sourceRoot, sourceRoot);
    return yield* inspectKnowledgeEntries(entries, (relativePath) =>
      fs.readFileString(path.join(sourceRoot, relativePath)),
    );
  });

export const searchKnowledgeConcepts = (
  concepts: ReadonlyArray<KnowledgeConcept>,
  query: string,
): ReadonlyArray<KnowledgeConcept> => {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length === 0) return concepts;
  return concepts.filter((concept) =>
    `${concept.id}\n${concept.title}\n${concept.description ?? ""}\n${concept.tags?.join(" ") ?? ""}\n${concept.type ?? ""}\n${concept.body}`
      .toLocaleLowerCase()
      .includes(needle),
  );
};

export const openKnowledgeConcept = (
  concepts: ReadonlyArray<KnowledgeConcept>,
  id: string,
): KnowledgeConcept | undefined => concepts.find((concept) => concept.id === id);

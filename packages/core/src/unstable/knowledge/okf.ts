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
    | "suspicious-instruction"
    | "symbolic-link"
    | "too-many-files"
    | "unsupported-okf-version"
    | "missing-type"
    | "invalid-frontmatter";
  readonly severity: "error" | "warning";
  readonly relativePath: string;
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
const SUSPICIOUS_INSTRUCTION =
  /\b(?:ignore|disregard|override)\b.{0,80}\b(?:previous|prior|system|developer|user|workspace)\b.{0,40}\b(?:instruction|prompt|message|rule)s?\b/is;

interface BundleEntry {
  readonly relativePath: string;
  readonly type: FileSystem.File.Type;
  readonly size: bigint;
}

const bundleEntries = (
  root: string,
  current: string,
): Effect.Effect<ReadonlyArray<BundleEntry>, unknown, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = [...(yield* fs.readDirectory(current))].sort();
    const files: BundleEntry[] = [];
    for (const entry of entries) {
      const absolute = path.join(current, entry);
      const stat = yield* fs.stat(absolute);
      if (stat.type === "Directory") {
        files.push(...(yield* bundleEntries(root, absolute)));
      } else {
        files.push({
          relativePath: path.relative(root, absolute),
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

/**
 * Inspect an OKF bundle. The root index requirement is an explicit AgentXM
 * profile constraint; upstream OKF 0.1 itself permits a root without it.
 */
export const inspectKnowledgeBundle = (
  sourceRoot: string,
): Effect.Effect<KnowledgeInspection, unknown, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* bundleEntries(sourceRoot, sourceRoot);
    const files = entries
      .filter((entry) => entry.type === "File" && entry.relativePath.toLowerCase().endsWith(".md"))
      .map((entry) => entry.relativePath);
    const diagnostics: KnowledgeDiagnostic[] = [];
    const concepts: KnowledgeConcept[] = [];
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
    for (const entry of entries) {
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
      const raw = yield* fs.readFileString(path.join(sourceRoot, relativePath));
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
      const baseName = path.basename(relativePath).toLowerCase();
      const metadata = parsed.value.frontmatter;
      const isMetadata = typeof metadata === "object" && metadata !== null;
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
      if (SUSPICIOUS_INSTRUCTION.test(parsed.value.body)) {
        diagnostics.push({
          code: "suspicious-instruction",
          severity: "warning",
          relativePath,
          message: `${relativePath} contains instruction-like text that may be prompt injection; review it before publishing.`,
        });
      }
      concepts.push({
        id: conceptId(relativePath),
        title: title ?? conceptId(relativePath),
        ...(type === undefined ? {} : { type }),
        ...(description === undefined ? {} : { description }),
        ...(tags === undefined ? {} : { tags }),
        relativePath,
        body: parsed.value.body,
      });
    }
    return { concepts, diagnostics };
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

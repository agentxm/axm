/**
 * Open Knowledge Format discovery and validation (v0.2). Every diagnostic names
 * the rule set it checks: base OKF conformance, the AgentXM profile, or
 * Registry safety.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type { PlatformError } from "effect/PlatformError";
import * as Result from "effect/Result";
import * as Predicate from "effect/Predicate";
import {
  FrontmatterParseFailure,
  findFrontmatterBoundaries,
  parseFrontmatterEffect,
} from "../content/frontmatter.js";
import { matchesKnowledgeSearchQuery, type KnowledgeSearchQuery } from "./knowledge-search.js";

/** OKF dialect versions this inspector understands. */
type OkfVersion = "0.2";

/** Actor that produced or confirmed a concept, per the OKF actor convention. */
export interface KnowledgeActorRecord {
  readonly by: string;
  readonly at?: string;
}

/**
 * Trust tier derived from `verified`, per OKF 0.2. A concept is
 * `human-reviewed` when any verifier is a `human:<id>` actor,
 * `machine-confirmed` when verified only by non-human actors, and
 * `unverified` when `verified` is absent.
 */
export type KnowledgeTrustTier = "unverified" | "machine-confirmed" | "human-reviewed";

export type KnowledgeDocumentKind = "concept" | "index" | "log";

/** An authored Markdown link and the bundle-local concept it resolves to, when any. */
export interface KnowledgeAuthoredLink {
  readonly target: string;
  readonly line: number;
  readonly resolvedConceptId?: string;
}

/**
 * Where a concept's `title` came from: a non-empty frontmatter `title`, else
 * the body's first level-one heading, else the concept ID (OKF 0.2 §4.1 lets
 * consumers derive a display name when `title` is omitted).
 */
export type KnowledgeTitleSource = "frontmatter" | "heading" | "concept-id";

export interface KnowledgeConcept {
  readonly id: string;
  readonly kind: KnowledgeDocumentKind;
  /** Display name: frontmatter `title`, else the first level-one heading, else the concept ID. */
  readonly title: string;
  readonly titleSource: KnowledgeTitleSource;
  /** The body's first level-one heading, absent when the body has none. */
  readonly authoredTitle?: string;
  readonly frontmatter?: Readonly<Record<string, unknown>>;
  readonly type?: string;
  readonly description?: string;
  readonly tags?: ReadonlyArray<string>;
  readonly resource?: string;
  readonly status?: string;
  readonly staleAfter?: string;
  readonly generated?: KnowledgeActorRecord;
  readonly verified?: ReadonlyArray<KnowledgeActorRecord>;
  readonly trust?: KnowledgeTrustTier;
  readonly authoredLinks: ReadonlyArray<KnowledgeAuthoredLink>;
  readonly relativePath: string;
  readonly body: string;
}

export const KNOWLEDGE_DIAGNOSTIC_CODES = [
  "bundle-too-large",
  "file-too-large",
  "invalid-tags",
  "missing-root-index",
  "missing-okf-version",
  "missing-title",
  "missing-description",
  "missing-manifest-description",
  "empty-bundle",
  "missing-tags",
  "symbolic-link",
  "too-many-files",
  "unsupported-okf-version",
  "missing-type",
  "invalid-frontmatter",
  "case-collision",
  "dangerous-uri",
  "detected-secret",
  "unsafe-path",
  "invalid-index",
  "invalid-log",
  "invalid-resource",
  "escaping-resource",
  "unresolved-resource",
  "broken-internal-link",
  "escaping-link",
  "unreachable-concept",
  "missing-index-entry",
  "stale-index-entry",
  "embedded-html",
  "duplicate-resource",
  "inconsistent-type",
  "large-concept",
  "large-index",
  "unreferenced-asset",
  "invalid-sources",
  "invalid-generated",
  "invalid-verified",
  "invalid-status",
  "invalid-stale-after",
  "invalid-attestation",
  "missing-frontmatter",
  "superseded-timestamp",
  "superseded-citations",
  "missing-index-heading",
  "unexpected-log-frontmatter",
  "unordered-log-dates",
] as const;

export type KnowledgeDiagnosticCode = (typeof KNOWLEDGE_DIAGNOSTIC_CODES)[number];

/**
 * The rule sets a Knowledge diagnostic checks, exactly one per diagnostic.
 * `okf-conformance` is base OKF 0.2 conformance: only the three rules of §11.
 * `agentxm-profile` is the AgentXM producer profile applied beyond base OKF,
 * including every check OKF leaves soft (SHOULD, MAY, or unstated).
 * `registry-safety` protects the Registry and the people and agents consuming
 * a bundle (limits, containment, active content, secrets) rather than
 * describing knowledge quality.
 */
export const KNOWLEDGE_RULE_SETS = [
  "okf-conformance",
  "agentxm-profile",
  "registry-safety",
] as const;

export type KnowledgeRuleSet = (typeof KNOWLEDGE_RULE_SETS)[number];

/** The three OKF 0.2 §11 conformance rules, in specification order. */
export const KNOWLEDGE_CONFORMANCE_RULES = [
  {
    id: "parseable-frontmatter",
    description: "Every non-reserved Markdown file contains a parseable YAML frontmatter block.",
  },
  {
    id: "non-empty-type",
    description: "Every frontmatter block contains a non-empty type field.",
  },
  {
    id: "reserved-file-structure",
    description: "Every index.md and log.md follows the index and log file structure.",
  },
] as const;

export type KnowledgeConformanceRule = (typeof KNOWLEDGE_CONFORMANCE_RULES)[number]["id"];

/** The rule set one diagnostic code checks, and the §11 rule an OKF-conformance code fails. */
export type KnowledgeDiagnosticClassification =
  | { readonly ruleSet: "okf-conformance"; readonly conformanceRule: KnowledgeConformanceRule }
  | { readonly ruleSet: "agentxm-profile" | "registry-safety"; readonly conformanceRule?: never };

const profile = { ruleSet: "agentxm-profile" } as const;
const safety = { ruleSet: "registry-safety" } as const;
const conformance = (conformanceRule: KnowledgeConformanceRule) =>
  ({ ruleSet: "okf-conformance", conformanceRule }) as const;

/**
 * The classification of every diagnostic code, read from OKF 0.2. Only a
 * failure of a §11 rule is `okf-conformance`; a check OKF marks SHOULD or MAY,
 * or leaves to producers, is `agentxm-profile`. The annotation makes a new
 * code fail to compile until it is classified here.
 */
export const KNOWLEDGE_DIAGNOSTIC_CLASSIFICATIONS: {
  readonly [Code in KnowledgeDiagnosticCode]: KnowledgeDiagnosticClassification;
} = {
  "bundle-too-large": safety,
  "file-too-large": safety,
  // §4.1 recommends `tags` as a list of strings.
  "invalid-tags": profile,
  // §3 and §8: `index.md` is optional, including at the bundle root.
  "missing-root-index": profile,
  // §12: a bundle MAY declare `okf_version`; consumers SHOULD read undeclared or
  // unknown versions best-effort.
  "missing-okf-version": profile,
  "unsupported-okf-version": profile,
  // §4.1: `title`, `description`, and `tags` are recommended, not required.
  "missing-title": profile,
  "missing-description": profile,
  "missing-manifest-description": profile,
  "empty-bundle": profile,
  "missing-tags": profile,
  "symbolic-link": safety,
  "too-many-files": safety,
  // §11 rule 2. A missing frontmatter block is `missing-frontmatter` instead.
  "missing-type": conformance("non-empty-type"),
  // §11 rule 1: the block is present but its YAML does not parse.
  "invalid-frontmatter": conformance("parseable-frontmatter"),
  "missing-frontmatter": conformance("parseable-frontmatter"),
  "case-collision": safety,
  "dangerous-uri": safety,
  "detected-secret": safety,
  "unsafe-path": safety,
  // §11 rule 3 with §8: an index carries no frontmatter except a bundle-root
  // `okf_version` key, and its body groups entries under section headings. A
  // reserved index whose frontmatter does not parse fails this rule, not rule 1.
  "invalid-index": conformance("reserved-file-structure"),
  // §8 permits a section heading at any level; a level-one heading is profile.
  "missing-index-heading": profile,
  // §11 rule 3 with §9: date headings MUST use ISO 8601 `YYYY-MM-DD`.
  "invalid-log": conformance("reserved-file-structure"),
  // §9 states no frontmatter rule and orders entries newest first without a
  // MUST, so a log that carries frontmatter or misorders its dates is profile.
  "unexpected-log-frontmatter": profile,
  "unordered-log-dates": profile,
  // §6.2 path-valued fields and §5 families are SHOULD guidance under §11.
  "invalid-resource": profile,
  "escaping-resource": safety,
  "unresolved-resource": profile,
  // §6.1: consumers MUST tolerate broken links.
  "broken-internal-link": profile,
  "escaping-link": safety,
  "unreachable-concept": profile,
  "missing-index-entry": profile,
  "stale-index-entry": profile,
  "embedded-html": safety,
  "duplicate-resource": profile,
  "inconsistent-type": profile,
  "large-concept": profile,
  "large-index": profile,
  "unreferenced-asset": profile,
  "invalid-sources": profile,
  "invalid-generated": profile,
  "invalid-verified": profile,
  "invalid-status": profile,
  "invalid-stale-after": profile,
  "invalid-attestation": profile,
  // §13.1: consumers MAY still read the v0.1 forms.
  "superseded-timestamp": profile,
  "superseded-citations": profile,
};

export interface KnowledgeFrontmatterParseDetails {
  readonly kind: "frontmatter-parse";
  readonly reason: string;
}

export interface KnowledgeDiagnostic {
  readonly code: KnowledgeDiagnosticCode;
  /** The rule set `code` checks, from `KNOWLEDGE_DIAGNOSTIC_CLASSIFICATIONS`. */
  readonly ruleSet: KnowledgeRuleSet;
  /** The §11 rule failed; present exactly when `ruleSet` is `okf-conformance`. */
  readonly conformanceRule?: KnowledgeConformanceRule;
  readonly severity: "error" | "warning";
  readonly relativePath: string;
  readonly line?: number;
  readonly column?: number;
  readonly message: string;
  readonly details?: KnowledgeFrontmatterParseDetails;
}

/** Build a diagnostic whose rule set is always the classification of its code. */
export const knowledgeDiagnostic = ({
  code,
  ...fields
}: Omit<KnowledgeDiagnostic, "ruleSet" | "conformanceRule">): KnowledgeDiagnostic => ({
  code,
  ...KNOWLEDGE_DIAGNOSTIC_CLASSIFICATIONS[code],
  ...fields,
});

const fileBaseName = (relativePath: string): string =>
  (relativePath.replace(/\\/g, "/").split("/").at(-1) ?? relativePath).toLowerCase();

/**
 * Convert a typed frontmatter failure into the stable Knowledge diagnostic
 * contract. OKF 0.2 §11 rule 1 covers only concept documents, so a reserved
 * index reports the failure against the index structure of §8 and a reserved
 * log, which §9 gives no frontmatter, against the profile.
 */
export const frontmatterParseDiagnostic = (
  relativePath: string,
  failure: FrontmatterParseFailure,
): KnowledgeDiagnostic => {
  const baseName = fileBaseName(relativePath);
  const [code, prefix] =
    baseName === "index.md"
      ? (["invalid-index", "Invalid YAML frontmatter in a reserved index"] as const)
      : baseName === "log.md"
        ? (["unexpected-log-frontmatter", "Invalid YAML frontmatter in a reserved log"] as const)
        : (["invalid-frontmatter", "Invalid YAML frontmatter"] as const);
  return knowledgeDiagnostic({
    code,
    severity: "error",
    relativePath,
    ...(failure.line === undefined ? {} : { line: failure.line }),
    ...(failure.column === undefined ? {} : { column: failure.column }),
    message: `${prefix}: ${failure.reason}`,
    details: { kind: "frontmatter-parse", reason: failure.reason },
  });
};

export interface KnowledgeInspection {
  readonly concepts: ReadonlyArray<KnowledgeConcept>;
  readonly diagnostics: ReadonlyArray<KnowledgeDiagnostic>;
  /** Canonical dialect required at the bundle root. */
  readonly okfVersion: OkfVersion;
}

const RESERVED_BASENAMES = new Set(["index.md", "log.md"]);
const OKF_VERSION: OkfVersion = "0.2";
const CONCEPT_STATUSES = new Set(["draft", "stable", "deprecated"]);
const ATTESTED_COMPUTATION_TYPE = "attested computation";
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
): Effect.Effect<
  ReadonlyArray<KnowledgeBundleEntry>,
  PlatformError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = [...(yield* fs.readDirectory(current))].sort();
    const files: KnowledgeBundleEntry[] = [];
    for (const entry of entries) {
      const absolute = path.join(current, entry);
      const stat = yield* fs.lstat(absolute);
      if (stat.type === "SymbolicLink") {
        files.push({
          relativePath: path.relative(root, absolute).replace(/\\/g, "/"),
          type: "SymbolicLink",
          size: 0n,
        });
        continue;
      }
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

/** Collect a bundle's normalized entry inventory without following symbolic links. */
export const collectKnowledgeBundleEntries = (
  sourceRoot: string,
): Effect.Effect<
  ReadonlyArray<KnowledgeBundleEntry>,
  PlatformError,
  FileSystem.FileSystem | Path.Path
> => bundleEntries(sourceRoot, sourceRoot);

interface MarkdownHeading {
  readonly level: number;
  readonly text: string;
  /** One-based line of the heading's first line within the scanned body. */
  readonly line: number;
}

/**
 * The non-empty ATX and setext headings of a Markdown body in order. Lines in
 * fenced or indented code are not headings, and a setext underline makes the
 * paragraph above it a heading, as CommonMark renders them.
 */
const markdownHeadings = (body: string): ReadonlyArray<MarkdownHeading> => {
  const headings: MarkdownHeading[] = [];
  let fence: { readonly marker: string; readonly length: number } | undefined;
  let paragraph: { readonly lines: string[]; readonly line: number } | undefined;
  const push = (level: number, text: string, line: number): void => {
    if (text.length > 0) headings.push({ level, text, line });
  };
  body.split(/\r?\n/).forEach((text, index) => {
    const line = index + 1;
    if (fence !== undefined) {
      const closing = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(text)?.[1];
      if (
        closing !== undefined &&
        closing.charAt(0) === fence.marker &&
        closing.length >= fence.length
      ) {
        fence = undefined;
      }
      return;
    }
    const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
    const openingFence = opening?.[1];
    if (
      openingFence !== undefined &&
      !(openingFence.startsWith("`") && (opening?.[2] ?? "").includes("`"))
    ) {
      fence = { marker: openingFence.charAt(0), length: openingFence.length };
      paragraph = undefined;
      return;
    }
    if (paragraph !== undefined) {
      const underline = /^ {0,3}(=+|-+)[ \t]*$/.exec(text)?.[1];
      if (underline !== undefined) {
        push(underline.startsWith("=") ? 1 : 2, paragraph.lines.join(" "), paragraph.line);
        paragraph = undefined;
        return;
      }
    }
    const atx = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/.exec(text);
    const marker = atx?.[1];
    if (marker !== undefined) {
      push(marker.length, (atx?.[2] ?? "").replace(/(?:^|[ \t]+)#+$/, "").trim(), line);
      paragraph = undefined;
      return;
    }
    if (text.trim().length === 0) {
      paragraph = undefined;
      return;
    }
    if (
      /^ {0,3}(?:[*+>-]|\d{1,9}[.)])(?:[ \t]|$)/.test(text) ||
      /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(text) ||
      /^ {0,3}[<|]/.test(text)
    ) {
      paragraph = undefined;
      return;
    }
    if (paragraph !== undefined) {
      paragraph.lines.push(text.trim());
      return;
    }
    if (/^(?: {4}|\t)/.test(text)) return;
    paragraph = { lines: [text.trim()], line };
  });
  return headings;
};

const conceptId = (relativePath: string): string => relativePath.replace(/\.md$/i, "");

const markdownLinks = (body: string): ReadonlyArray<KnowledgeAuthoredLink> => {
  const links: KnowledgeAuthoredLink[] = [];
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

const schemeLike = (target: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(target);

const resourcePathPortion = (target: string): string => {
  const query = target.indexOf("?");
  const fragment = target.indexOf("#");
  const suffix = [query, fragment]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  return suffix === undefined ? target : target.slice(0, suffix);
};

const resourceSuffix = (target: string): string => target.slice(resourcePathPortion(target).length);

type ResourceKind = "url" | "path" | "scope" | "invalid";

const classifyResource = (value: string, allowScope: boolean): ResourceKind => {
  const target = value.trim();
  if (target.length === 0) return "invalid";
  if (schemeLike(target)) {
    if (activeScheme(target)) return "invalid";
    try {
      return new URL(target).protocol.length > 1 ? "url" : "invalid";
    } catch {
      return "invalid";
    }
  }
  if (!allowScope) return "path";
  const pathPortion = resourcePathPortion(target);
  return pathPortion.startsWith("/") ||
    pathPortion.startsWith("./") ||
    pathPortion.startsWith("../") ||
    pathPortion.includes("/") ||
    (/^\S+$/.test(pathPortion) && /\.[a-z0-9]{1,8}$/i.test(pathPortion))
    ? "path"
    : "scope";
};

interface ResourceIssue {
  readonly code:
    "invalid-resource" | "invalid-sources" | "escaping-resource" | "unresolved-resource";
  readonly severity: "error" | "warning";
  readonly message: string;
}

interface ResourceInspection {
  readonly kind: ResourceKind;
  readonly identity?: string;
  readonly issue?: ResourceIssue;
}

const inspectResource = (
  value: string,
  sourcePath: string,
  allFilePaths: ReadonlySet<string>,
  options: {
    readonly allowScope: boolean;
    readonly invalidCode: "invalid-resource" | "invalid-sources";
    readonly label: string;
  },
): ResourceInspection => {
  const target = value.trim();
  const kind = classifyResource(value, options.allowScope);
  if (kind === "invalid") {
    return {
      kind,
      issue: {
        code: options.invalidCode,
        severity: "error",
        message: `${options.label} must be a safe absolute URI${options.allowScope ? ", contained path, or scope description" : " or contained path"}.`,
      },
    };
  }
  if (kind === "url") return { kind, identity: value };
  if (kind === "scope") return { kind };
  const normalized = normalizedPath(sourcePath, target);
  if (normalized === null) {
    return {
      kind: "invalid",
      issue: {
        code: options.invalidCode,
        severity: "error",
        message: `${options.label} must be a safe absolute URI${options.allowScope ? ", contained path, or scope description" : " or contained path"}.`,
      },
    };
  }
  if (normalized.escaped) {
    return {
      kind,
      issue: {
        code: "escaping-resource",
        severity: "error",
        message: `${options.label} escapes the Knowledge bundle.`,
      },
    };
  }
  const identity = `${normalized.path}${resourceSuffix(target)}`;
  if (!allFilePaths.has(normalized.path)) {
    return {
      kind,
      identity,
      issue: {
        code: "unresolved-resource",
        severity: "warning",
        message: `${options.label} points to missing bundle path ${resourcePathPortion(target)}.`,
      },
    };
  }
  return { kind, identity };
};

const validIsoTimestamp = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
  !Number.isNaN(Date.parse(value));

const validIsoDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

/**
 * OKF 0.2 actor convention: `<producer>/<version>` for agents and tools,
 * `human:<id>` for people, and `process:<id>` for automated processes.
 */
const validActor = (value: string): boolean => {
  if (value.length === 0 || /\s/.test(value)) return false;
  const prefixed = /^(?:human|process):(.+)$/.exec(value);
  if (prefixed !== null) return (prefixed[1]?.length ?? 0) > 0;
  const segments = value.split("/");
  return segments.length === 2 && segments.every((segment) => segment.length > 0);
};

const dateIssue = (value: unknown, label: string): string | undefined =>
  typeof value === "string" && validIsoDate(value)
    ? undefined
    : `${label} must be an ISO 8601 YYYY-MM-DD date.`;

/** Validate one `{ by, at }` actor record shared by `generated` and `verified`. */
const actorRecordIssues = (value: unknown, label: string): ReadonlyArray<string> => {
  if (!Predicate.isReadonlyObject(value)) return [`${label} must be a mapping with a by field.`];
  const issues: string[] = [];
  const by = value["by"];
  if (typeof by !== "string" || !validActor(by)) {
    issues.push(
      `${label}.by must use the OKF actor convention (<producer>/<version>, human:<id>, or process:<id>).`,
    );
  }
  const at = value["at"];
  if (at !== undefined && (typeof at !== "string" || !validIsoTimestamp(at))) {
    issues.push(`${label}.at must be an ISO 8601 date-time with a timezone.`);
  }
  return issues;
};

const sourcesIssues = (
  value: unknown,
  relativePath: string,
  allFilePaths: ReadonlySet<string>,
): ReadonlyArray<ResourceIssue> => {
  if (!Array.isArray(value)) {
    return [
      {
        code: "invalid-sources",
        severity: "error",
        message: "sources must be a list of source entries.",
      },
    ];
  }
  const issues: ResourceIssue[] = [];
  const invalid = (message: string): void => {
    issues.push({ code: "invalid-sources", severity: "error", message });
  };
  const ids = new Map<string, number>();
  value.forEach((entry: unknown, index) => {
    const label = `sources[${index}]`;
    if (!Predicate.isReadonlyObject(entry)) {
      invalid(`${label} must be a mapping.`);
      return;
    }
    const resource = entry["resource"];
    if (typeof resource !== "string") {
      invalid(
        `${label}.resource is required and must be a safe absolute URI, contained path, or scope description.`,
      );
    } else {
      const inspected = inspectResource(resource, relativePath, allFilePaths, {
        allowScope: true,
        invalidCode: "invalid-sources",
        label: `${label}.resource`,
      });
      if (inspected.issue !== undefined) issues.push(inspected.issue);
    }
    const id = entry["id"];
    if (id !== undefined) {
      if (typeof id !== "string" || id.trim().length === 0) {
        invalid(`${label}.id must be a non-empty string.`);
      } else {
        const seen = ids.get(id);
        if (seen !== undefined) invalid(`${label}.id duplicates sources[${seen}].id.`);
        else ids.set(id, index);
      }
    }
    const title = entry["title"];
    if (title !== undefined && typeof title !== "string") {
      invalid(`${label}.title must be a string.`);
    }
    // `author` is a free-form credibility signal, not an actor field; the spec
    // uses values such as `team:ga4-docs` that the actor convention rejects.
    const author = entry["author"];
    if (author !== undefined && (typeof author !== "string" || author.trim().length === 0)) {
      invalid(`${label}.author must be a non-empty string.`);
    }
    const usageCount = entry["usage_count"];
    if (
      usageCount !== undefined &&
      (typeof usageCount !== "number" || !Number.isInteger(usageCount) || usageCount < 0)
    ) {
      invalid(`${label}.usage_count must be a non-negative integer.`);
    }
    const lastModified = entry["last_modified"];
    if (lastModified !== undefined) {
      const issue = dateIssue(lastModified, `${label}.last_modified`);
      if (issue !== undefined) invalid(issue);
    }
  });
  return issues;
};

const usageWindowIssues = (value: unknown): ReadonlyArray<string> => {
  if (!Predicate.isReadonlyObject(value))
    return ["usage_window must be a mapping with from and to dates."];
  const issues: string[] = [];
  for (const key of ["from", "to"]) {
    const issue = dateIssue(value[key], `usage_window.${key}`);
    if (issue !== undefined) issues.push(issue);
  }
  return issues;
};

const verifiedRecords = (value: unknown): ReadonlyArray<unknown> =>
  Array.isArray(value) ? value : [value];

const attestationIssues = (metadata: unknown, body: string): ReadonlyArray<string> => {
  const issues: string[] = [];
  const runtime = metadataField(metadata, "runtime");
  if (typeof runtime !== "string" || runtime.trim().length === 0) {
    issues.push("Attested Computation concepts require a non-empty runtime.");
  }
  const parameters = metadataField(metadata, "parameters");
  if (parameters !== undefined) {
    if (!Array.isArray(parameters)) {
      issues.push("parameters must be a list of typed parameter mappings.");
    } else {
      parameters.forEach((parameter: unknown, index) => {
        const label = `parameters[${index}]`;
        if (!Predicate.isReadonlyObject(parameter)) {
          issues.push(`${label} must be a mapping.`);
          return;
        }
        const name = parameter["name"];
        if (typeof name !== "string" || name.trim().length === 0) {
          issues.push(`${label}.name is required and must be a non-empty string.`);
        }
        const type = parameter["type"];
        if (typeof type !== "string" || type.trim().length === 0) {
          issues.push(`${label}.type is required and must be a non-empty string.`);
        }
        const required = parameter["required"];
        if (required !== undefined && typeof required !== "boolean") {
          issues.push(`${label}.required must be a boolean.`);
        }
      });
    }
  }
  for (const key of ["executor", "attester"]) {
    const value = metadataField(metadata, key);
    if (value === undefined) continue;
    if (!Predicate.isReadonlyObject(value)) {
      issues.push(`${key} must be a mapping with a resource.`);
      continue;
    }
    const resource = value["resource"];
    if (typeof resource !== "string" || resource.trim().length === 0) {
      issues.push(`${key}.resource is required and must be a non-empty string.`);
    }
    const receipt = value["receipt"];
    if (
      receipt !== undefined &&
      (!Array.isArray(receipt) || !receipt.every((field: unknown) => typeof field === "string"))
    ) {
      issues.push(`${key}.receipt must be a list of receipt field names.`);
    }
  }
  const computation = metadataField(metadata, "computation");
  if (computation !== undefined && typeof computation !== "string") {
    issues.push("computation must be a bundle-relative path to a computation file.");
  }
  if (computation === undefined && !/^#\s+Computation\s*$/im.test(body)) {
    issues.push(
      "Attested Computation concepts require a `# Computation` body heading or a computation field.",
    );
  }
  return issues;
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

const isReserved = (relativePath: string): boolean =>
  RESERVED_BASENAMES.has(fileBaseName(relativePath));

const documentKind = (relativePath: string): KnowledgeDocumentKind => {
  const baseName = relativePath.replace(/\\/g, "/").split("/").at(-1)?.toLowerCase();
  if (baseName === "index.md") return "index";
  if (baseName === "log.md") return "log";
  return "concept";
};

/**
 * Where an authored Knowledge link points. `external` is a URL with a scheme or
 * a protocol-relative URL, `same-document` has only a query or fragment,
 * `escaped` leaves the bundle, `missing` names a bundle path that holds no file,
 * and `resolved` names a bundle file. `query` and `fragment` carry the raw text
 * after `?` and `#` when the target has them.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type KnowledgeLinkResolution =
  | { readonly _tag: "external" }
  | { readonly _tag: "escaped" }
  | ({ readonly _tag: "same-document" } & KnowledgeLinkSuffix)
  | ({ readonly _tag: "missing"; readonly path: string } & KnowledgeLinkSuffix)
  | ({
      readonly _tag: "resolved";
      readonly path: string;
      readonly kind: "markdown";
      readonly conceptId: string;
    } & KnowledgeLinkSuffix)
  | ({
      readonly _tag: "resolved";
      readonly path: string;
      readonly kind: "asset";
    } & KnowledgeLinkSuffix);

/**
 * The query and fragment of a link target, without their `?` and `#` delimiters.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface KnowledgeLinkSuffix {
  readonly query?: string;
  readonly fragment?: string;
}

const linkSuffix = (target: string): KnowledgeLinkSuffix => {
  const fragmentStart = target.indexOf("#");
  const beforeFragment = fragmentStart < 0 ? target : target.slice(0, fragmentStart);
  const queryStart = beforeFragment.indexOf("?");
  return {
    ...(queryStart < 0 ? {} : { query: beforeFragment.slice(queryStart + 1) }),
    ...(fragmentStart < 0 ? {} : { fragment: target.slice(fragmentStart + 1) }),
  };
};

const isMarkdownPath = (relativePath: string): boolean =>
  relativePath.toLowerCase().endsWith(".md");

/**
 * Resolve a link authored in `sourcePath` against the bundle's file paths, with
 * the rule Knowledge inspection uses for `authoredLinks[].resolvedConceptId`. A
 * relative target resolves from the source document's directory and a target
 * starting with `/` from the bundle root, after percent-decoding. A target
 * without a `.md` extension names `path.md` when the bundle has it, else
 * `path/index.md` when the bundle has it, else `path` itself, which may be an
 * asset; so `guides` and `guides/` both name `guides/index.md` when the bundle
 * has no `guides.md`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const resolveKnowledgeLink = (
  sourcePath: string,
  target: string,
  bundleFilePaths: ReadonlySet<string>,
): KnowledgeLinkResolution => {
  const normalized = normalizedPath(sourcePath, target);
  const suffix = linkSuffix(target);
  if (normalized === null) {
    return resourcePathPortion(target).length === 0
      ? { _tag: "same-document", ...suffix }
      : { _tag: "external" };
  }
  if (normalized.escaped) return { _tag: "escaped" };
  const path = isMarkdownPath(normalized.path)
    ? normalized.path
    : ([`${normalized.path}.md`, `${normalized.path}/index.md`].find((candidate) =>
        bundleFilePaths.has(candidate),
      ) ?? normalized.path);
  if (!bundleFilePaths.has(path)) return { _tag: "missing", path, ...suffix };
  return isMarkdownPath(path)
    ? { _tag: "resolved", path, kind: "markdown", conceptId: conceptId(path), ...suffix }
    : { _tag: "resolved", path, kind: "asset", ...suffix };
};

/**
 * Inspect a canonical OKF 0.2 bundle. The root index requirement is an explicit
 * AgentXM profile constraint; upstream OKF permits a root without it.
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
    const report = (fields: Parameters<typeof knowledgeDiagnostic>[0]): void => {
      diagnostics.push(knowledgeDiagnostic(fields));
    };
    // §8: an index groups its entries under section headings; this profile
    // further requires a level-one heading.
    const inspectIndexBody = (relativePath: string, body: string): void => {
      const headings = markdownHeadings(body);
      if (headings.length === 0) {
        report({
          code: "invalid-index",
          severity: "error",
          relativePath,
          message: `${relativePath} must group its entries under at least one section heading.`,
        });
      } else if (!headings.some(({ level }) => level === 1)) {
        report({
          code: "missing-index-heading",
          severity: "error",
          relativePath,
          message: `${relativePath} must contain at least one level-one section heading.`,
        });
      }
    };
    // §9: date headings MUST use ISO 8601 `YYYY-MM-DD`; this profile further
    // requires them newest first.
    const inspectLogBody = (relativePath: string, body: string): void => {
      const dateHeadings = markdownHeadings(body).filter(({ level }) => level === 2);
      const invalid = dateHeadings.find(
        ({ text }) =>
          !/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`)),
      );
      if (invalid !== undefined) {
        report({
          code: "invalid-log",
          severity: "error",
          relativePath,
          line: invalid.line,
          message: `${relativePath} date headings must use valid ISO 8601 YYYY-MM-DD dates.`,
        });
      }
      const dates = dateHeadings.map(({ text }) => text);
      if (dates.some((date, index) => index > 0 && date > (dates[index - 1] ?? date))) {
        report({
          code: "unordered-log-dates",
          severity: "error",
          relativePath,
          message: `${relativePath} date headings must be newest first.`,
        });
      }
    };
    const concepts: KnowledgeConcept[] = [];
    const linksByPath = new Map<string, ReadonlyArray<KnowledgeAuthoredLink>>();
    const resources = new Map<string, string[]>();
    const types = new Map<string, Set<string>>();
    if (entries.length > MAX_BUNDLE_FILES) {
      report({
        code: "too-many-files",
        severity: "error",
        relativePath: ".",
        message: `Knowledge bundle contains ${entries.length} files; the safety limit is ${MAX_BUNDLE_FILES}.`,
      });
    }
    const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0n);
    if (totalBytes > MAX_BUNDLE_BYTES) {
      report({
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
        report({
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
        report({
          code: "symbolic-link",
          severity: "error",
          relativePath: entry.relativePath,
          message: `${entry.relativePath} is a symbolic link; knowledge bundles must be self-contained.`,
        });
      }
      if (entry.size > MAX_FILE_BYTES) {
        report({
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
        report({
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
        report({
          code: "large-concept",
          severity: "warning",
          relativePath: entry.relativePath,
          message: `${entry.relativePath} is unusually large and may be expensive to consume.`,
        });
      }
    }
    for (const colliding of pathsByCase.values()) {
      if (new Set(colliding).size > 1) {
        report({
          code: "case-collision",
          severity: "error",
          relativePath: colliding[0] ?? ".",
          message: `Bundle paths collide on case-insensitive filesystems: ${colliding.join(", ")}.`,
        });
      }
    }
    if (!files.includes("index.md")) {
      report({
        code: "missing-root-index",
        severity: "error",
        relativePath: "index.md",
        message: "AgentXM knowledge bundles require src/index.md as their discovery root.",
      });
    }

    const rawByPath = new Map<string, string>();
    for (const relativePath of files) {
      rawByPath.set(relativePath, yield* readMarkdown(relativePath));
    }

    for (const relativePath of files) {
      const raw = rawByPath.get(relativePath) ?? "";
      const links = markdownLinks(raw);
      linksByPath.set(relativePath, links);
      const foundSecretLine = secretLine(raw);
      if (foundSecretLine !== undefined) {
        report({
          code: "detected-secret",
          severity: "error",
          relativePath,
          line: foundSecretLine,
          message: `${relativePath} contains a high-confidence credential or private key pattern.`,
        });
      }
      for (const link of links) {
        if (activeScheme(link.target)) {
          report({
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
        report({
          code: "dangerous-uri",
          severity: "error",
          relativePath,
          line: raw.slice(0, activeHtmlUri.index).split(/\r?\n/).length,
          message: `${relativePath} contains a dangerous active URI scheme.`,
        });
      }
      if (/<\/?(?:script|iframe|object|embed|form|style|video|audio|svg|math)\b[^>]*>/i.test(raw)) {
        report({
          code: "embedded-html",
          severity: "warning",
          relativePath,
          message: `${relativePath} contains embedded HTML; consumers must sanitize it.`,
        });
      }
      const parsed = yield* parseFrontmatterEffect(raw).pipe(Effect.result);
      const baseName = fileBaseName(relativePath);
      if (Result.isFailure(parsed)) {
        diagnostics.push(frontmatterParseDiagnostic(relativePath, parsed.failure));
        // A reserved file still has its body structure checked.
        const body = raw.slice(findFrontmatterBoundaries(raw)?.bodyStart ?? 0);
        if (baseName === "index.md") inspectIndexBody(relativePath, body);
        if (baseName === "log.md") inspectLogBody(relativePath, body);
        continue;
      }
      const parsedValue = parsed.success;
      const metadata = parsedValue.frontmatter;
      const isMetadata = typeof metadata === "object" && metadata !== null;
      if (baseName === "index.md") {
        if (relativePath === "index.md") {
          // §8 and §12: the bundle-root index may carry only `okf_version`.
          if (metadata !== undefined && (!isMetadata || Array.isArray(metadata))) {
            report({
              code: "invalid-index",
              severity: "error",
              relativePath,
              message: `${relativePath} frontmatter must be a mapping that declares only okf_version.`,
            });
          } else if (isMetadata) {
            const extraKeys = Object.keys(metadata).filter((key) => key !== "okf_version");
            if (extraKeys.length > 0) {
              report({
                code: "invalid-index",
                severity: "error",
                relativePath,
                message: `${relativePath} frontmatter may declare only okf_version; found ${extraKeys.join(", ")}.`,
              });
            }
          }
        } else if (findFrontmatterBoundaries(raw) !== undefined) {
          report({
            code: "invalid-index",
            severity: "error",
            relativePath,
            message: `${relativePath} is a reserved index and must not contain frontmatter.`,
          });
        }
        inspectIndexBody(relativePath, parsedValue.body);
      }
      if (baseName === "log.md") {
        if (findFrontmatterBoundaries(raw) !== undefined) {
          report({
            code: "unexpected-log-frontmatter",
            severity: "error",
            relativePath,
            message: `${relativePath} is a reserved log and must not contain frontmatter.`,
          });
        }
        inspectLogBody(relativePath, parsedValue.body);
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
      const resourceInspection =
        resource === undefined
          ? undefined
          : inspectResource(resource, relativePath, allFilePaths, {
              allowScope: false,
              invalidCode: "invalid-resource",
              label: `${relativePath} resource`,
            });
      const timestampValue = metadataField(metadata, "timestamp");
      if (isMetadata && "tags" in metadata && metadata.tags !== undefined && tags === undefined) {
        report({
          code: "invalid-tags",
          severity: "error",
          relativePath,
          message: `${relativePath} tags must be an array of strings.`,
        });
      }
      if (relativePath === "index.md") {
        const declaredVersion =
          isMetadata && "okf_version" in metadata ? String(metadata.okf_version) : undefined;
        if (declaredVersion === undefined) {
          report({
            code: "missing-okf-version",
            severity: "error",
            relativePath,
            message: `src/index.md requires okf_version: ${OKF_VERSION} in YAML frontmatter.`,
          });
        } else if (declaredVersion !== OKF_VERSION) {
          report({
            code: "unsupported-okf-version",
            severity: "error",
            relativePath,
            message: `Unsupported OKF version ${declaredVersion}; expected ${OKF_VERSION}.`,
          });
        }
      }
      if (
        !RESERVED_BASENAMES.has(baseName) &&
        resourceValue !== undefined &&
        (resource === undefined || resourceInspection?.issue !== undefined)
      ) {
        const issue =
          resourceInspection?.issue ??
          ({
            code: "invalid-resource",
            severity: "error",
            message: `${relativePath} resource must be a safe absolute URI or contained path.`,
          } satisfies ResourceIssue);
        report({ ...issue, relativePath });
      }
      if (!RESERVED_BASENAMES.has(baseName) && timestampValue !== undefined) {
        report({
          code: "superseded-timestamp",
          severity: "error",
          relativePath,
          message: `${relativePath} timestamp is superseded in OKF 0.2; use generated.at.`,
        });
      }
      const statusValue = metadataField(metadata, "status");
      const staleAfterValue = metadataField(metadata, "stale_after");
      const generatedValue = metadataField(metadata, "generated");
      const verifiedValue = metadataField(metadata, "verified");
      const sourcesValue = metadataField(metadata, "sources");
      const usageWindowValue = metadataField(metadata, "usage_window");
      const generated =
        Predicate.isReadonlyObject(generatedValue) && typeof generatedValue["by"] === "string"
          ? {
              by: generatedValue["by"],
              ...(typeof generatedValue["at"] === "string" ? { at: generatedValue["at"] } : {}),
            }
          : undefined;
      const verified = verifiedRecords(verifiedValue)
        .filter(Predicate.isReadonlyObject)
        .flatMap((record) =>
          typeof record["by"] === "string"
            ? [
                {
                  by: record["by"],
                  ...(typeof record["at"] === "string" ? { at: record["at"] } : {}),
                },
              ]
            : [],
        );
      const trust: KnowledgeTrustTier =
        verifiedValue === undefined || verified.length === 0
          ? "unverified"
          : verified.some((record) => record.by.startsWith("human:"))
            ? "human-reviewed"
            : "machine-confirmed";
      if (!RESERVED_BASENAMES.has(baseName)) {
        if (sourcesValue !== undefined) {
          for (const issue of sourcesIssues(sourcesValue, relativePath, allFilePaths)) {
            report({
              code: issue.code,
              severity: issue.severity,
              relativePath,
              message: `${relativePath} ${issue.message}`,
            });
          }
        }
        if (usageWindowValue !== undefined) {
          for (const issue of usageWindowIssues(usageWindowValue)) {
            report({
              code: "invalid-sources",
              severity: "error",
              relativePath,
              message: `${relativePath} ${issue}`,
            });
          }
        }
        if (generatedValue !== undefined) {
          for (const issue of actorRecordIssues(generatedValue, "generated")) {
            report({
              code: "invalid-generated",
              severity: "error",
              relativePath,
              message: `${relativePath} ${issue}`,
            });
          }
        }
        if (verifiedValue !== undefined) {
          const records = verifiedRecords(verifiedValue);
          records.forEach((record, index) => {
            const label = Array.isArray(verifiedValue) ? `verified[${index}]` : "verified";
            for (const issue of actorRecordIssues(record, label)) {
              report({
                code: "invalid-verified",
                severity: "error",
                relativePath,
                message: `${relativePath} ${issue}`,
              });
            }
          });
        }
        if (
          statusValue !== undefined &&
          (typeof statusValue !== "string" || !CONCEPT_STATUSES.has(statusValue))
        ) {
          report({
            code: "invalid-status",
            severity: "error",
            relativePath,
            message: `${relativePath} status must be one of ${[...CONCEPT_STATUSES].join(", ")}.`,
          });
        }
        if (staleAfterValue !== undefined) {
          const issue = dateIssue(staleAfterValue, "stale_after");
          if (issue !== undefined) {
            report({
              code: "invalid-stale-after",
              severity: "error",
              relativePath,
              message: `${relativePath} ${issue}`,
            });
          }
        }
        if (type !== undefined && type.toLocaleLowerCase() === ATTESTED_COMPUTATION_TYPE) {
          for (const issue of attestationIssues(metadata, parsedValue.body)) {
            report({
              code: "invalid-attestation",
              severity: "error",
              relativePath,
              message: `${relativePath} ${issue}`,
            });
          }
        }
      }
      if (!RESERVED_BASENAMES.has(baseName) && findFrontmatterBoundaries(raw) === undefined) {
        report({
          code: "missing-frontmatter",
          severity: "error",
          relativePath,
          message: `${relativePath} is an OKF concept and requires a YAML frontmatter block with a non-empty type.`,
        });
      } else if (!RESERVED_BASENAMES.has(baseName) && type === undefined) {
        report({
          code: "missing-type",
          severity: "error",
          relativePath,
          message: `${relativePath} is an OKF concept and requires a non-empty frontmatter type.`,
        });
      }
      const titleValue = metadataField(metadata, "title");
      const frontmatterTitle =
        typeof titleValue === "string" && titleValue.trim().length > 0
          ? titleValue.trim()
          : undefined;
      const bodyHeadings = markdownHeadings(parsedValue.body);
      const authoredTitle = bodyHeadings.find(({ level }) => level === 1)?.text;
      if (frontmatterTitle === undefined && authoredTitle === undefined) {
        report({
          code: "missing-title",
          severity: "warning",
          relativePath,
          message: `${relativePath} should include a frontmatter title or one level-one heading for a stable display title.`,
        });
      }
      if (!RESERVED_BASENAMES.has(baseName) && description === undefined) {
        report({
          code: "missing-description",
          severity: "warning",
          relativePath,
          message: `${relativePath} should include a concise frontmatter description.`,
        });
      }
      if (!RESERVED_BASENAMES.has(baseName) && tags === undefined) {
        report({
          code: "missing-tags",
          severity: "warning",
          relativePath,
          message: `${relativePath} should include frontmatter tags for discovery.`,
        });
      }
      if (
        !RESERVED_BASENAMES.has(baseName) &&
        resource !== undefined &&
        resourceInspection?.identity !== undefined &&
        resourceInspection.issue?.code !== "escaping-resource" &&
        resourceInspection.issue?.code !== "invalid-resource"
      ) {
        const matching = resources.get(resourceInspection.identity) ?? [];
        matching.push(relativePath);
        resources.set(resourceInspection.identity, matching);
      }
      if (!RESERVED_BASENAMES.has(baseName) && type !== undefined) {
        const spellings = types.get(type.toLocaleLowerCase()) ?? new Set<string>();
        spellings.add(type);
        types.set(type.toLocaleLowerCase(), spellings);
      }
      const citationHeading = bodyHeadings.find(
        ({ level, text }) => level === 1 && text.toLowerCase() === "citations",
      );
      if (citationHeading !== undefined && !RESERVED_BASENAMES.has(baseName)) {
        report({
          code: "superseded-citations",
          severity: "error",
          relativePath,
          line: citationHeading.line,
          message: `${relativePath} # Citations is superseded in OKF 0.2; use sources frontmatter.`,
        });
      }
      concepts.push({
        id: conceptId(relativePath),
        kind: documentKind(relativePath),
        title: frontmatterTitle ?? authoredTitle ?? conceptId(relativePath),
        titleSource:
          frontmatterTitle !== undefined
            ? "frontmatter"
            : authoredTitle !== undefined
              ? "heading"
              : "concept-id",
        ...(authoredTitle === undefined ? {} : { authoredTitle }),
        ...(Predicate.isReadonlyObject(metadata) ? { frontmatter: metadata } : {}),
        ...(type === undefined ? {} : { type }),
        ...(description === undefined ? {} : { description }),
        ...(tags === undefined ? {} : { tags }),
        ...(resource === undefined ? {} : { resource }),
        ...(typeof statusValue === "string" ? { status: statusValue } : {}),
        ...(typeof staleAfterValue === "string" ? { staleAfter: staleAfterValue } : {}),
        ...(generated === undefined ? {} : { generated }),
        ...(verified.length === 0 ? {} : { verified }),
        trust,
        authoredLinks: [],
        relativePath,
        body: parsedValue.body,
      });
    }

    const outgoing = new Map<string, Set<string>>();
    const authoredLinksByPath = new Map<string, ReadonlyArray<KnowledgeAuthoredLink>>();
    const referencedFiles = new Set<string>();
    for (const [sourcePath, links] of linksByPath) {
      const targets = new Set<string>();
      const authoredLinks: KnowledgeAuthoredLink[] = [];
      for (const link of links) {
        const resolution = resolveKnowledgeLink(sourcePath, link.target, allFilePaths);
        switch (resolution._tag) {
          case "external":
          case "same-document":
            authoredLinks.push(link);
            break;
          case "escaped":
            authoredLinks.push(link);
            report({
              code: "escaping-link",
              severity: "warning",
              relativePath: sourcePath,
              line: link.line,
              message: `${sourcePath} links outside the Knowledge bundle.`,
            });
            break;
          case "missing":
            authoredLinks.push(link);
            report({
              code: sourcePath.toLowerCase().endsWith("index.md")
                ? "stale-index-entry"
                : "broken-internal-link",
              severity: "warning",
              relativePath: sourcePath,
              line: link.line,
              message: `${sourcePath} links to missing bundle path ${link.target}.`,
            });
            break;
          case "resolved":
            referencedFiles.add(resolution.path);
            if (resolution.kind === "markdown") {
              targets.add(resolution.path);
              authoredLinks.push({ ...link, resolvedConceptId: resolution.conceptId });
            } else {
              authoredLinks.push(link);
            }
            break;
        }
      }
      outgoing.set(sourcePath, targets);
      authoredLinksByPath.set(sourcePath, authoredLinks);
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
        report({
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
          report({
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
        report({
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
          report({
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
        report({
          code: "inconsistent-type",
          severity: "warning",
          relativePath: ".",
          message: `Concept type spellings differ only by casing: ${[...spellings].sort().join(", ")}.`,
        });
      }
    }
    if (!concepts.some((concept) => !isReserved(concept.relativePath))) {
      report({
        code: "empty-bundle",
        severity: "warning",
        relativePath: "index.md",
        message: "Knowledge bundle contains no concept documents to discover.",
      });
    }
    return {
      concepts: concepts.map((concept) => ({
        ...concept,
        authoredLinks: authoredLinksByPath.get(concept.relativePath) ?? [],
      })),
      diagnostics,
      okfVersion: OKF_VERSION,
    };
  });

export const inspectKnowledgeBundle = (
  sourceRoot: string,
): Effect.Effect<KnowledgeInspection, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* collectKnowledgeBundleEntries(sourceRoot);
    return yield* inspectKnowledgeEntries(entries, (relativePath) =>
      fs.readFileString(path.join(sourceRoot, relativePath)),
    );
  });

export const searchKnowledgeConcepts = (
  concepts: ReadonlyArray<KnowledgeConcept>,
  query: KnowledgeSearchQuery,
): ReadonlyArray<KnowledgeConcept> =>
  concepts.filter((concept) => matchesKnowledgeSearchQuery(concept, query));

export const openKnowledgeConcept = (
  concepts: ReadonlyArray<KnowledgeConcept>,
  id: string,
): KnowledgeConcept | undefined => concepts.find((concept) => concept.id === id);

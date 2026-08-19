/**
 * Versioned ownership-marker grammar shared by every comment-bearing AXM
 * projection. The normative contract lives in
 * `docs/architecture/workspace/managed-file-ownership.md`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";

export const MARKER_VERSION = 1 as const;
export const MARKER_KIND_START = "axm:start" as const;
export const MARKER_KIND_END = "axm:end" as const;
export const MARKER_KIND_FILE = "axm:file" as const;
export const MARKER_KIND_POINT = "axm:point" as const;

export type RegionName =
  "rules" | "knowledge" | "hook-fallbacks" | "instruction-aliases" | `mcp-server:${string}`;

export type FileCommentStyle =
  | { readonly kind: "line"; readonly prefix: "#" | "//" }
  | {
      readonly kind: "block";
      readonly open: "<!--" | "/*";
      readonly close: "-->" | "*/";
    };

export interface RegionMarker {
  readonly kind: typeof MARKER_KIND_START | typeof MARKER_KIND_END;
  readonly v: typeof MARKER_VERSION;
  readonly region: RegionName;
  readonly ext?: string | undefined;
  readonly src?: string | undefined;
}

export type ManagedMarker =
  | RegionMarker
  | {
      readonly kind: typeof MARKER_KIND_FILE;
      readonly v: typeof MARKER_VERSION;
      readonly ext: string;
      readonly src: string;
    }
  | {
      readonly kind: typeof MARKER_KIND_POINT;
      readonly v: typeof MARKER_VERSION;
      readonly pointKind: string;
      readonly ext: string;
    };

export type MarkerParseResult =
  | { readonly state: "absent"; readonly reasonCode: "marker-absent" }
  | {
      readonly state: "complete";
      readonly reasonCode: "marker-complete";
      readonly marker: ManagedMarker;
    }
  | {
      readonly state: "malformed";
      readonly reasonCode: "marker-malformed";
      readonly message: string;
    }
  | {
      readonly state: "unsupported-version";
      readonly reasonCode: "marker-unsupported-version";
      readonly message: string;
      readonly version: string;
    };

const blockCommentExtensions = new Set([".md", ".mdx", ".html", ".htm", ".xml", ".svg", ".css"]);

const hashCommentExtensions = new Set([
  ".py",
  ".rb",
  ".sh",
  ".bash",
  ".zsh",
  ".toml",
  ".yaml",
  ".yml",
]);

const hashCommentBasenames = new Set([
  ".gitignore",
  ".dockerignore",
  ".npmignore",
  ".prettierignore",
  ".nxignore",
  "dockerfile",
  "makefile",
]);

const slashCommentExtensions = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".rs",
  ".go",
  ".java",
  ".kt",
  ".kts",
  ".c",
  ".h",
  ".cpp",
  ".hpp",
  ".cc",
  ".swift",
  ".scala",
  ".dart",
]);

const basenameOf = (target: string): string => {
  const slash = Math.max(target.lastIndexOf("/"), target.lastIndexOf("\\"));
  return target.slice(slash + 1).toLowerCase();
};

const extensionOf = (basename: string): string => {
  const dot = basename.lastIndexOf(".");
  return dot > 0 ? basename.slice(dot) : "";
};

/** Resolve a target's native comment grammar, failing closed for unknown files. */
export const commentStyleForTarget = (target: string): Option.Option<FileCommentStyle> => {
  const basename = basenameOf(target);
  if (hashCommentBasenames.has(basename)) return Option.some({ kind: "line", prefix: "#" });
  const extension = extensionOf(basename);
  if (blockCommentExtensions.has(extension)) {
    return extension === ".css"
      ? Option.some({ kind: "block", open: "/*", close: "*/" })
      : Option.some({ kind: "block", open: "<!--", close: "-->" });
  }
  if (slashCommentExtensions.has(extension)) {
    return Option.some({ kind: "line", prefix: "//" });
  }
  return hashCommentExtensions.has(extension)
    ? Option.some({ kind: "line", prefix: "#" })
    : Option.none();
};

const encodeMarkerValue = (value: string): string =>
  /[\s%=~]/u.test(value) ? `~${encodeURIComponent(JSON.stringify(value))}` : value;

const decodeMarkerValue = (value: string): Option.Option<string> => {
  if (!value.startsWith("~")) return Option.some(value);
  try {
    const decoded: unknown = JSON.parse(decodeURIComponent(value.slice(1)));
    return typeof decoded === "string" ? Option.some(decoded) : Option.none();
  } catch {
    return Option.none();
  }
};

const isRegionName = (value: string): value is RegionName =>
  value === "rules" ||
  value === "knowledge" ||
  value === "hook-fallbacks" ||
  value === "instruction-aliases" ||
  /^mcp-server:[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value);

const markerAttributes = (marker: ManagedMarker): ReadonlyArray<readonly [string, string]> => {
  const common: Array<readonly [string, string]> = [["v", String(marker.v)]];
  switch (marker.kind) {
    case "axm:start":
    case "axm:end":
      return [
        ...common,
        ["region", marker.region],
        ...(marker.ext === undefined ? [] : ([["ext", marker.ext]] as const)),
        ...(marker.src === undefined ? [] : ([["src", marker.src]] as const)),
      ];
    case "axm:file":
      return [...common, ["ext", marker.ext], ["src", marker.src]];
    case "axm:point":
      return [...common, ["ext", marker.ext], ["kind", marker.pointKind]];
  }
};

/** Serialize one marker with canonical attribute ordering. */
export const serializeMarker = (marker: ManagedMarker, style: FileCommentStyle): string => {
  const priority = new Map([
    ["v", 0],
    ["region", 1],
    ["ext", 2],
    ["src", 3],
  ]);
  const attributes = [...markerAttributes(marker)]
    .sort(([left], [right]) => {
      const leftPriority = priority.get(left) ?? 4;
      const rightPriority = priority.get(right) ?? 4;
      return leftPriority - rightPriority || left.localeCompare(right);
    })
    .map(([key, value]) => `${key}=${encodeMarkerValue(value)}`)
    .join(" ");
  const payload = `${marker.kind} ${attributes}`;
  return style.kind === "line"
    ? `${style.prefix} ${payload}`
    : `${style.open} ${payload} ${style.close}`;
};

const uncommentMarker = (line: string, style: FileCommentStyle): Option.Option<string> => {
  const trimmed = line.trim();
  if (style.kind === "line") {
    return trimmed.startsWith(style.prefix)
      ? Option.some(trimmed.slice(style.prefix.length).trim())
      : Option.none();
  }
  return trimmed.startsWith(style.open) && trimmed.endsWith(style.close)
    ? Option.some(trimmed.slice(style.open.length, -style.close.length).trim())
    : Option.none();
};

const malformed = (message: string): MarkerParseResult => ({
  state: "malformed",
  reasonCode: "marker-malformed",
  message,
});

/** Parse one native-comment marker line without assigning meaning to unknown attributes. */
export const parseMarker = (line: string, style: FileCommentStyle): MarkerParseResult => {
  const uncommented = uncommentMarker(line, style);
  if (Option.isNone(uncommented)) return { state: "absent", reasonCode: "marker-absent" };
  const parts = uncommented.value.split(/\s+/u);
  const head = parts[0];
  if (head !== "axm:start" && head !== "axm:end" && head !== "axm:file" && head !== "axm:point") {
    return { state: "absent", reasonCode: "marker-absent" };
  }
  const attributes = new Map<string, string>();
  for (const part of parts.slice(1)) {
    const equalsIndex = part.indexOf("=");
    if (equalsIndex <= 0 || equalsIndex === part.length - 1) {
      return malformed(`Malformed AXM ownership marker attribute: ${part}`);
    }
    const key = part.slice(0, equalsIndex);
    if (attributes.has(key)) return malformed(`Duplicate AXM ownership marker attribute: ${key}`);
    const value = decodeMarkerValue(part.slice(equalsIndex + 1));
    if (Option.isNone(value)) return malformed(`Invalid AXM ownership marker value: ${key}`);
    attributes.set(key, value.value);
  }
  const version = attributes.get("v");
  if (version === undefined) return malformed("AXM ownership marker is missing v");
  if (version !== String(MARKER_VERSION)) {
    return {
      state: "unsupported-version",
      reasonCode: "marker-unsupported-version",
      version,
      message: `AXM ownership marker version ${version} is unsupported; upgrade AXM before modifying this file`,
    };
  }
  if (head === "axm:start" || head === "axm:end") {
    const region = attributes.get("region");
    if (region === undefined || !isRegionName(region)) {
      return malformed("AXM region marker has an invalid or missing region");
    }
    const ext = attributes.get("ext");
    const src = attributes.get("src");
    return {
      state: "complete",
      reasonCode: "marker-complete",
      marker: {
        kind: head,
        v: MARKER_VERSION,
        region,
        ...(ext === undefined ? {} : { ext }),
        ...(src === undefined ? {} : { src }),
      },
    };
  }
  const ext = attributes.get("ext");
  if (ext === undefined) return malformed(`${head} marker is missing ext`);
  if (head === "axm:file") {
    const src = attributes.get("src");
    return src === undefined
      ? malformed("axm:file marker is missing src")
      : {
          state: "complete",
          reasonCode: "marker-complete",
          marker: { kind: head, v: MARKER_VERSION, ext, src },
        };
  }
  const pointKind = attributes.get("kind");
  return pointKind === undefined
    ? malformed("axm:point marker is missing kind")
    : {
        state: "complete",
        reasonCode: "marker-complete",
        marker: { kind: head, v: MARKER_VERSION, pointKind, ext },
      };
};

export const sameRegionIdentity = (
  marker: ManagedMarker,
  region: RegionName,
): marker is RegionMarker =>
  (marker.kind === "axm:start" || marker.kind === "axm:end") && marker.region === region;

export const markerForFile = (
  content: string,
  style: FileCommentStyle,
): Option.Option<Extract<ManagedMarker, { readonly kind: "axm:file" }>> => {
  for (const line of content.split(/\r?\n/u).slice(0, 12)) {
    const candidate =
      style.kind === "block" &&
      line.trim().startsWith(style.open) &&
      !line.trim().endsWith(style.close)
        ? `${line.trim()} ${style.close}`
        : line;
    const parsed = parseMarker(candidate, style);
    if (parsed.state === "complete" && parsed.marker.kind === "axm:file") {
      return Option.some(parsed.marker);
    }
  }
  return Option.none();
};

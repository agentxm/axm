/**
 * Managed-region marker helpers for context files packages.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";

export type FileCommentStyle =
  | { readonly kind: "line"; readonly prefix: string }
  | { readonly kind: "block"; readonly open: string; readonly close: string };

export interface FileRegionMarkerIdentity {
  readonly region: string;
  readonly ext?: string | undefined;
  readonly generator?: string | undefined;
}

export type FileRegionMarkerKind = "start" | "end";

export interface FileRegionMarker extends FileRegionMarkerIdentity {
  readonly kind: FileRegionMarkerKind;
}

export interface ReplaceManagedRegionArgs {
  readonly content: string;
  readonly marker: FileRegionMarkerIdentity;
  readonly rendered: string;
  readonly style: FileCommentStyle;
}

const blockCommentExtensions = new Set([".md", ".mdx", ".html", ".htm", ".xml", ".svg"]);

const lineCommentExtensions = new Set([
  ".css",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".py",
  ".rb",
  ".rs",
  ".go",
  ".java",
  ".kt",
  ".kts",
  ".sh",
  ".bash",
  ".zsh",
  ".toml",
  ".yaml",
  ".yml",
]);

const strictCommentlessExtensions = new Set([".json", ".jsonc"]);

const extensionOf = (target: string): string => {
  const slash = Math.max(target.lastIndexOf("/"), target.lastIndexOf("\\"));
  const basename = target.slice(slash + 1);
  const dot = basename.lastIndexOf(".");
  return dot >= 0 ? basename.slice(dot).toLowerCase() : "";
};

/**
 * Resolve native comment style for a managed-region target.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const commentStyleForTarget = (target: string): Option.Option<FileCommentStyle> => {
  const ext = extensionOf(target);
  if (blockCommentExtensions.has(ext)) {
    return Option.some({ kind: "block", open: "<!--", close: "-->" });
  }
  if (lineCommentExtensions.has(ext)) {
    const prefix = ext === ".css" ? "/*" : "#";
    if (prefix === "/*") return Option.some({ kind: "block", open: "/*", close: "*/" });
    if ([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"].includes(ext)) {
      return Option.some({ kind: "line", prefix: "//" });
    }
    return Option.some({ kind: "line", prefix });
  }
  return strictCommentlessExtensions.has(ext)
    ? Option.none()
    : Option.some({ kind: "line", prefix: "#" });
};

const markerPayload = (marker: FileRegionMarker): string => {
  const owner =
    marker.ext !== undefined
      ? ` ext=${marker.ext}`
      : marker.generator !== undefined
        ? ` generator=${marker.generator}`
        : "";
  return `axm:${marker.kind} region=${marker.region}${owner}`;
};

/**
 * Serialize a region marker in native comment syntax.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const serializeRegionMarker = (
  marker: FileRegionMarker,
  style: FileCommentStyle,
): string => {
  const payload = markerPayload(marker);
  switch (style.kind) {
    case "line":
      return `${style.prefix} ${payload}`;
    case "block":
      return `${style.open} ${payload} ${style.close}`;
  }
};

const uncommentMarker = (line: string, style: FileCommentStyle): Option.Option<string> => {
  const trimmed = line.trim();
  switch (style.kind) {
    case "line": {
      if (!trimmed.startsWith(style.prefix)) return Option.none();
      return Option.some(trimmed.slice(style.prefix.length).trim());
    }
    case "block": {
      if (!trimmed.startsWith(style.open) || !trimmed.endsWith(style.close)) return Option.none();
      return Option.some(trimmed.slice(style.open.length, -style.close.length).trim());
    }
  }
};

/**
 * Parse a single marker line.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const parseRegionMarker = (
  line: string,
  style: FileCommentStyle,
): Option.Option<FileRegionMarker> => {
  const uncommented = uncommentMarker(line, style);
  if (Option.isNone(uncommented)) return Option.none();
  const parts = uncommented.value.split(/\s+/);
  const head = parts[0];
  if (head !== "axm:start" && head !== "axm:end") return Option.none();
  let region: string | undefined;
  let ext: string | undefined;
  let generator: string | undefined;
  for (const part of parts.slice(1)) {
    const [key, value, extra] = part.split("=");
    if (key === undefined || value === undefined || extra !== undefined) return Option.none();
    if (key === "region") region = value;
    if (key === "ext") ext = value;
    if (key === "generator") generator = value;
  }
  if (region === undefined) return Option.none();
  return Option.some({
    kind: head === "axm:start" ? "start" : "end",
    region,
    ...(ext !== undefined && { ext }),
    ...(generator !== undefined && { generator }),
  });
};

const sameIdentity = (marker: FileRegionMarker, identity: FileRegionMarkerIdentity): boolean =>
  marker.region === identity.region &&
  marker.ext === identity.ext &&
  marker.generator === identity.generator;

const splitLines = (content: string): ReadonlyArray<string> => content.split(/\r?\n/);

const findRegion = (
  content: string,
  identity: FileRegionMarkerIdentity,
  style: FileCommentStyle,
): Option.Option<{
  readonly start: number;
  readonly end: number;
  readonly lines: ReadonlyArray<string>;
}> => {
  const lines = splitLines(content);
  let start: number | undefined;
  let end: number | undefined;
  for (const [index, line] of lines.entries()) {
    const parsed = parseRegionMarker(line, style);
    if (Option.isNone(parsed) || !sameIdentity(parsed.value, identity)) continue;
    if (parsed.value.kind === "start") {
      if (start !== undefined)
        throw new Error(`Nested or duplicate AXM region start: ${identity.region}`);
      start = index;
    }
    if (parsed.value.kind === "end") {
      if (start === undefined) throw new Error(`AXM region end without start: ${identity.region}`);
      if (end !== undefined) throw new Error(`Duplicate AXM region end: ${identity.region}`);
      end = index;
    }
  }
  if (start !== undefined && end === undefined) {
    throw new Error(`AXM region start without end: ${identity.region}`);
  }
  return start !== undefined && end !== undefined && start < end
    ? Option.some({ start, end, lines })
    : Option.none();
};

const markerLines = (identity: FileRegionMarkerIdentity, style: FileCommentStyle) => ({
  start: serializeRegionMarker({ ...identity, kind: "start" }, style),
  end: serializeRegionMarker({ ...identity, kind: "end" }, style),
});

/**
 * Replace an existing managed region, or append it if absent.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const replaceManagedRegion = ({
  content,
  marker,
  rendered,
  style,
}: ReplaceManagedRegionArgs): string => {
  const markers = markerLines(marker, style);
  const renderedLines = splitLines(rendered);
  const replacement = [markers.start, ...renderedLines, markers.end];
  const located = findRegion(content, marker, style);
  if (Option.isNone(located)) {
    const suffix = content.endsWith("\n") || content.length === 0 ? "" : "\n";
    return `${content}${suffix}${replacement.join("\n")}\n`;
  }
  const before = located.value.lines.slice(0, located.value.start);
  const after = located.value.lines.slice(located.value.end + 1);
  return [...before, ...replacement, ...after].join("\n");
};

/**
 * Strip an existing managed region. Missing regions are left unchanged.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const stripManagedRegion = (
  content: string,
  marker: FileRegionMarkerIdentity,
  style: FileCommentStyle,
): string => {
  const located = findRegion(content, marker, style);
  if (Option.isNone(located)) return content;
  const before = located.value.lines.slice(0, located.value.start);
  const after = located.value.lines.slice(located.value.end + 1);
  return [...before, ...after].join("\n");
};

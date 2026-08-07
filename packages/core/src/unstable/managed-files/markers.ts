/**
 * Managed-region marker helpers shared by installable extension types.
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
  readonly options?: Readonly<Record<string, string>> | undefined;
}

export interface ReplaceManagedRegionArgs {
  readonly content: string;
  readonly marker: FileRegionMarkerIdentity;
  readonly rendered: string;
  readonly style: FileCommentStyle;
  readonly startLine?: string | undefined;
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

// Extensions whose line comments use `//` rather than `#`. Rust/Go/Java/Kotlin
// (and the C family) would otherwise get an invalid `#` marker that breaks the
// file.
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
  if (slashCommentExtensions.has(ext)) {
    return Option.some({ kind: "line", prefix: "//" });
  }
  if (lineCommentExtensions.has(ext)) {
    if (ext === ".css") return Option.some({ kind: "block", open: "/*", close: "*/" });
    return Option.some({ kind: "line", prefix: "#" });
  }
  return strictCommentlessExtensions.has(ext)
    ? Option.none()
    : Option.some({ kind: "line", prefix: "#" });
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

const markerPayload = (marker: FileRegionMarker): string => {
  const owner =
    marker.ext !== undefined
      ? ` ext=${encodeMarkerValue(marker.ext)}`
      : marker.generator !== undefined
        ? ` generator=${encodeMarkerValue(marker.generator)}`
        : "";
  const options = Object.entries(marker.options ?? {})
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => ` ${key}=${encodeMarkerValue(value)}`)
    .join("");
  return `axm:${marker.kind} region=${encodeMarkerValue(marker.region)}${owner}${options}`;
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
  const options: Record<string, string> = {};
  for (const part of parts.slice(1)) {
    const equalsIndex = part.indexOf("=");
    if (equalsIndex <= 0 || equalsIndex === part.length - 1) return Option.none();
    const key = part.slice(0, equalsIndex);
    const value = decodeMarkerValue(part.slice(equalsIndex + 1));
    if (Option.isNone(value)) return Option.none();
    if (key === "region") region = value.value;
    else if (key === "ext") ext = value.value;
    else if (key === "generator") generator = value.value;
    else options[key] = value.value;
  }
  if (region === undefined) return Option.none();
  const hasOptions = Object.keys(options).length > 0;
  return Option.some({
    kind: head === "axm:start" ? "start" : "end",
    region,
    ...(ext !== undefined && { ext }),
    ...(generator !== undefined && { generator }),
    ...(hasOptions && { options }),
  });
};

const sameIdentity = (marker: FileRegionMarker, identity: FileRegionMarkerIdentity): boolean =>
  marker.region === identity.region &&
  marker.ext === identity.ext &&
  marker.generator === identity.generator;

const splitLines = (content: string): ReadonlyArray<string> => content.split(/\r?\n/);

// Preserve the file's existing newline convention so replacing/stripping a
// managed region does not rewrite CRLF line endings to LF outside the region.
const detectEol = (content: string): string => (content.includes("\r\n") ? "\r\n" : "\n");

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
    // Be lenient about malformed marker sequences in hand-edited files: take the
    // first start and the first end after it, ignoring extras, rather than
    // throwing a raw Error that would escape as a defect and crash sync.
    if (parsed.value.kind === "start" && start === undefined) {
      start = index;
    } else if (parsed.value.kind === "end" && start !== undefined && end === undefined) {
      end = index;
    }
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
  startLine,
}: ReplaceManagedRegionArgs): string => {
  const markers = markerLines(marker, style);
  const startMarker = startLine ?? markers.start;
  const renderedLines = splitLines(rendered);
  const replacement = [startMarker, ...renderedLines, markers.end];
  const eol = detectEol(content);
  const located = findRegion(content, marker, style);
  if (Option.isNone(located)) {
    const suffix = content.endsWith("\n") || content.length === 0 ? "" : eol;
    return `${content}${suffix}${replacement.join(eol)}${eol}`;
  }
  const before = located.value.lines.slice(0, located.value.start);
  const after = located.value.lines.slice(located.value.end + 1);
  return [...before, ...replacement, ...after].join(eol);
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
  return [...before, ...after].join(detectEol(content));
};

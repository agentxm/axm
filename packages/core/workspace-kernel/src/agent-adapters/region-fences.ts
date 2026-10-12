/**
 * Name-only region fences: the one grammar AXM uses to delimit a region it
 * writes inside a human-authored file. A fence carries only a region name in
 * the file's native comment syntax; it carries no version, owner, source or
 * generation. The normative contract lives in
 * `docs/architecture/workspace/managed-file-ownership.md`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";

/** The closed runtime vocabulary of regions AXM writes. */
export const REGION_NAMES = ["rules", "knowledge", "instruction-aliases"] as const;
export type RegionName = (typeof REGION_NAMES)[number];

export const isRegionName = (value: string): value is RegionName =>
  REGION_NAMES.some((name) => name === value);

/** Native comment syntax of a fenced file. */
export type FenceSyntax = "markdown" | "hash";

const basenameOf = (target: string): string => {
  const slash = Math.max(target.lastIndexOf("/"), target.lastIndexOf("\\"));
  return target.slice(slash + 1).toLowerCase();
};

/** Resolve a target's fence syntax; any other file cannot carry a region. */
export const fenceSyntaxForTarget = (target: string): Option.Option<FenceSyntax> => {
  const basename = basenameOf(target);
  if (basename === ".gitignore") return Option.some("hash");
  return basename.endsWith(".md") || basename.endsWith(".mdx")
    ? Option.some("markdown")
    : Option.none();
};

/** One fence line found by {@link scanFences}. */
export interface FenceLine {
  /** Raw region name; it may lie outside the runtime vocabulary. */
  readonly name: string;
  readonly edge: "open" | "close";
  /** 0-based line index. */
  readonly line: number;
  /** Offset of the line's first character. */
  readonly start: number;
  /** Offset after the line's terminator, or the content length at EOF. */
  readonly end: number;
}

/** The comment text of a fence, after trimming: `axm:<name>` or `/axm:<name>`. */
export const FENCE_TEXT = /^(\/?)axm:([a-z0-9][a-z0-9-]*)$/;

/** The canonical serialization AXM writes for one fence line (no terminator). */
export const serializeFence = (
  name: RegionName,
  edge: "open" | "close",
  syntax: FenceSyntax,
): string => {
  const text = `${edge === "close" ? "/" : ""}axm:${name}`;
  return syntax === "markdown" ? `<!-- ${text} -->` : `# ${text}`;
};

interface RawLine {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

const splitLines = (content: string): ReadonlyArray<RawLine> => {
  const lines: Array<RawLine> = [];
  let start = 0;
  while (start < content.length) {
    const newline = content.indexOf("\n", start);
    const end = newline < 0 ? content.length : newline + 1;
    const text = content.slice(start, newline < 0 ? content.length : newline);
    lines.push({ text: text.endsWith("\r") ? text.slice(0, -1) : text, start, end });
    start = end;
  }
  return lines;
};

const fenceText = (inner: string): Option.Option<Pick<FenceLine, "name" | "edge">> => {
  const match = FENCE_TEXT.exec(inner.trim());
  const name = match?.[2];
  return match === null || name === undefined
    ? Option.none()
    : Option.some({ name, edge: match[1] === "/" ? "close" : "open" });
};

const markdownFence = (text: string): Option.Option<Pick<FenceLine, "name" | "edge">> =>
  text.startsWith("<!--") && text.endsWith("-->") && text.length >= "<!---->".length
    ? fenceText(text.slice("<!--".length, -"-->".length))
    : Option.none();

const hashFence = (text: string): Option.Option<Pick<FenceLine, "name" | "edge">> =>
  text.startsWith("#") ? fenceText(text.slice(1)) : Option.none();

/** A CommonMark code-fence opener: 0-3 spaces, then 3+ backticks or tildes. */
const CODE_FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;

interface OpenCodeFence {
  readonly marker: "`" | "~";
  readonly length: number;
}

const codeFenceOpener = (text: string): Option.Option<OpenCodeFence> => {
  const match = CODE_FENCE_OPEN.exec(text);
  const run = match?.[1];
  if (match === null || run === undefined) return Option.none();
  const marker = run.startsWith("`") ? "`" : "~";
  // A backtick fence's info string cannot contain a backtick.
  if (marker === "`" && (match[2] ?? "").includes("`")) return Option.none();
  return Option.some({ marker, length: run.length });
};

const closesCodeFence = (text: string, open: OpenCodeFence): boolean => {
  const match = /^ {0,3}(`+|~+)[ \t]*$/.exec(text);
  const run = match?.[1];
  return run !== undefined && run.startsWith(open.marker) && run.length >= open.length;
};

/**
 * Find every fence line in `content`.
 *
 * Markdown: a fence is a whole line, starting at column 0, that is exactly an
 * HTML comment whose trimmed text matches {@link FENCE_TEXT} (a trailing `\r`
 * is ignored). A line with leading whitespace is never a fence, so indented
 * code, list continuations and blockquote content never count. Lines inside a
 * CommonMark fenced code block are skipped: the block opens on a line indented
 * 0-3 spaces with 3+ backticks or tildes (a backtick info string holds no
 * backtick), closes on a line indented 0-3 spaces holding only a run of the
 * same character at least as long, and an unclosed block runs to EOF.
 *
 * Hash: a fence is a whole line starting with `#` whose remaining text,
 * trimmed, matches {@link FENCE_TEXT}.
 */
export const scanFences = (content: string, syntax: FenceSyntax): ReadonlyArray<FenceLine> => {
  const fences: Array<FenceLine> = [];
  let code: Option.Option<OpenCodeFence> = Option.none();
  for (const [line, raw] of splitLines(content).entries()) {
    if (syntax === "markdown") {
      if (Option.isSome(code)) {
        if (closesCodeFence(raw.text, code.value)) code = Option.none();
        continue;
      }
      code = codeFenceOpener(raw.text);
      if (Option.isSome(code)) continue;
    }
    const fence = syntax === "markdown" ? markdownFence(raw.text) : hashFence(raw.text);
    if (Option.isSome(fence)) fences.push({ ...fence.value, line, start: raw.start, end: raw.end });
  }
  return fences;
};

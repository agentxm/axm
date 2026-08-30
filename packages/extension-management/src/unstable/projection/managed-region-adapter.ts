/** Projection-owned read/modify/write adapter for managed text regions. */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { makeAppError, type AppError } from "../app-error/index.js";
import { protectWorkspacePath } from "../workspace/transaction.js";
import { recordFootprint } from "../workspace/footprint-recorder.js";
import {
  MARKER_KIND_END,
  MARKER_KIND_START,
  MARKER_VERSION,
  commentStyleForTarget,
  parseMarker,
  sameRegionIdentity,
  serializeMarker,
  type FileCommentStyle,
  type RegionMarker,
  type RegionName,
} from "./marker-grammar.js";

export type ManagedRegionState =
  | { readonly state: "absent"; readonly reasonCode: "managed-region-absent" }
  | {
      readonly state: "complete";
      readonly reasonCode: "managed-region-complete";
      readonly start: number;
      readonly end: number;
      readonly lines: ReadonlyArray<string>;
      readonly body: string;
      readonly startMarker: RegionMarker;
    }
  | {
      readonly state: "malformed";
      readonly reasonCode: "managed-region-malformed";
      readonly message: string;
    }
  | {
      readonly state: "unsupported-version";
      readonly reasonCode: "managed-region-unsupported-version";
      readonly message: string;
    };

export interface ManagedRegionReconciliation {
  readonly existed: boolean;
  readonly existing: string;
  readonly updated: string;
  readonly changed: boolean;
  readonly observedRegion: Option.Option<string>;
  readonly owner: string;
  readonly state: ManagedRegionState["state"];
  readonly reasonCode: ManagedRegionState["reasonCode"];
}

const splitLines = (content: string): ReadonlyArray<string> => content.split(/\r?\n/u);
const detectEol = (content: string): "\r\n" | "\n" => (content.includes("\r\n") ? "\r\n" : "\n");

/** Inspect one region without guessing through duplicate, nested, or unpaired markers. */
export const inspectManagedRegion = (
  content: string,
  region: RegionName,
  style: FileCommentStyle,
): ManagedRegionState => {
  const lines = splitLines(content);
  const matches: Array<{
    readonly index: number;
    readonly marker: RegionMarker;
  }> = [];
  for (const [index, line] of lines.entries()) {
    const parsed = parseMarker(line, style);
    if (parsed.state === "unsupported-version") {
      return {
        state: "unsupported-version",
        reasonCode: "managed-region-unsupported-version",
        message: parsed.message,
      };
    }
    if (parsed.state === "malformed") {
      return {
        state: "malformed",
        reasonCode: "managed-region-malformed",
        message: parsed.message,
      };
    }
    if (parsed.state === "complete" && sameRegionIdentity(parsed.marker, region)) {
      matches.push({ index, marker: parsed.marker });
    }
  }
  if (matches.length === 0) {
    return { state: "absent", reasonCode: "managed-region-absent" };
  }
  const start = matches[0];
  const end = matches[1];
  if (
    matches.length !== 2 ||
    start === undefined ||
    end === undefined ||
    start.marker.kind !== MARKER_KIND_START ||
    end.marker.kind !== MARKER_KIND_END ||
    start.index >= end.index
  ) {
    return {
      state: "malformed",
      reasonCode: "managed-region-malformed",
      message: `AXM managed region ${region} has duplicate, nested, or unpaired markers`,
    };
  }
  return {
    state: "complete",
    reasonCode: "managed-region-complete",
    start: start.index,
    end: end.index,
    lines,
    body: lines.slice(start.index + 1, end.index).join("\n"),
    startMarker: start.marker,
  };
};

const normalizeTableCell = (cell: string): string => {
  const normalized = cell.trim().replace(/\s+/gu, " ");
  if (!/^:?-{3,}:?$/u.test(normalized)) return normalized;
  return `${normalized.startsWith(":") ? ":" : ""}---${normalized.endsWith(":") ? ":" : ""}`;
};

const normalizeTableLine = (line: string): string =>
  line.trim().startsWith("|") ? line.trim().split("|").map(normalizeTableCell).join("|") : line;

/**
 * Compare generated bodies by meaning that common formatters preserve. Code
 * fences retain their line structure; prose wraps, trailing whitespace, and
 * Markdown table padding do not create drift.
 */
export const normalizeManagedBody = (content: string): string => {
  const output: Array<string> = [];
  let paragraph: Array<string> = [];
  let fence: "```" | "~~~" | undefined;
  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    output.push(paragraph.join(" ").replace(/\s+/gu, " ").trim());
    paragraph = [];
  };
  for (const rawLine of content.replace(/\r\n?/gu, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (fence !== undefined) {
      output.push(line);
      if (trimmed.startsWith(fence)) fence = undefined;
      continue;
    }
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      flushParagraph();
      fence = trimmed.startsWith("```") ? "```" : "~~~";
      output.push(line);
      continue;
    }
    if (trimmed.length === 0) {
      flushParagraph();
      if (output.length > 0 && output.at(-1) !== "") output.push("");
      continue;
    }
    if (/^\s{2,}\S/u.test(line) && /^[-*+]\s|^\d+[.)]\s/u.test(output.at(-1) ?? "")) {
      output[output.length - 1] = `${output.at(-1)} ${trimmed}`;
      continue;
    }
    if (trimmed.startsWith(">") && (output.at(-1) ?? "").startsWith(">")) {
      output[output.length - 1] = `${output.at(-1)} ${trimmed.slice(1).trim()}`;
      continue;
    }
    if (
      trimmed.startsWith("|") ||
      /^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|<!--|\/\*|# axm:|\/\/ axm:)/u.test(trimmed)
    ) {
      flushParagraph();
      output.push(normalizeTableLine(line));
      continue;
    }
    paragraph.push(trimmed);
  }
  flushParagraph();
  while (output.at(-1) === "") output.pop();
  return output.join("\n").trim();
};

export const renderManagedRegion = (args: {
  readonly content: string;
  readonly state: ManagedRegionState;
  readonly region: RegionName;
  readonly owner: string;
  readonly rendered: string;
  readonly style: FileCommentStyle;
}): string => {
  if (args.state.state === "malformed" || args.state.state === "unsupported-version") {
    return args.content;
  }
  const eol = detectEol(args.content);
  if (args.rendered.length === 0) {
    if (args.state.state === "absent") return args.content;
    return [
      ...args.state.lines.slice(0, args.state.start),
      ...args.state.lines.slice(args.state.end + 1),
    ].join(eol);
  }
  const start = serializeMarker(
    {
      kind: MARKER_KIND_START,
      v: MARKER_VERSION,
      region: args.region,
      ext: args.owner,
    },
    args.style,
  );
  const end = serializeMarker(
    { kind: MARKER_KIND_END, v: MARKER_VERSION, region: args.region },
    args.style,
  );
  const replacement = [start, ...splitLines(args.rendered), end];
  if (args.state.state === "absent") {
    const separator = args.content.length === 0 || args.content.endsWith("\n") ? "" : eol;
    return `${args.content}${separator}${replacement.join(eol)}${eol}`;
  }
  const currentStart = args.state.lines[args.state.start];
  const currentEnd = args.state.lines[args.state.end];
  if (
    currentStart === start &&
    currentEnd === end &&
    normalizeManagedBody(args.state.body) === normalizeManagedBody(args.rendered)
  ) {
    return args.content;
  }
  return [
    ...args.state.lines.slice(0, args.state.start),
    ...replacement,
    ...args.state.lines.slice(args.state.end + 1),
  ].join(eol);
};

const regionStateError = (displayPath: string, state: ManagedRegionState): AppError =>
  makeAppError({
    code: "conflict",
    detail:
      state.state === "unsupported-version"
        ? `${state.message}: ${displayPath}`
        : state.state === "malformed"
          ? `${state.message}: ${displayPath}`
          : `Cannot reconcile managed region: ${displayPath}`,
  });

/** Reconcile one AXM-owned region while preserving all surrounding bytes. */
export const reconcileManagedRegionFile = (args: {
  readonly targetPath: string;
  readonly displayPath: string;
  readonly region: RegionName;
  readonly owner: string;
  readonly rendered: string;
  readonly dryRun?: boolean;
  readonly removeEmptyFile?: boolean;
  readonly preserveEmptyFile?: boolean;
  readonly writeWhenMissing?: boolean;
  readonly unsupportedTargetDetail?: string;
}): Effect.Effect<ManagedRegionReconciliation, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const style = commentStyleForTarget(args.displayPath);
    if (Option.isNone(style)) {
      return yield* makeAppError({
        code: "validation",
        detail:
          args.unsupportedTargetDetail ??
          `Managed-region target does not support comments: ${args.displayPath}`,
      });
    }
    const existed = yield* fs.exists(args.targetPath).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          detail: `Failed to inspect managed-region target: ${args.targetPath}`,
          cause,
        }),
      ),
    );
    const existing = existed
      ? yield* fs.readFileString(args.targetPath).pipe(
          Effect.mapError((cause) =>
            makeAppError({
              code: "internal",
              detail: `Failed to read managed-region target: ${args.targetPath}`,
              cause,
            }),
          ),
        )
      : "";
    const state = inspectManagedRegion(existing, args.region, style.value);
    if (state.state === "malformed" || state.state === "unsupported-version") {
      return yield* regionStateError(args.displayPath, state);
    }
    const observedRegion =
      state.state === "complete" ? Option.some(state.body) : Option.none<string>();
    const updated = renderManagedRegion({
      content: existing,
      state,
      region: args.region,
      owner: args.owner,
      rendered: args.rendered,
      style: style.value,
    });
    const changed = updated !== existing;
    const result = {
      existed,
      existing,
      updated,
      changed,
      observedRegion,
      owner: args.owner,
      state: state.state,
      reasonCode: state.reasonCode,
    } satisfies ManagedRegionReconciliation;
    if (args.dryRun === true || (!changed && (existed || args.writeWhenMissing !== true))) {
      return result;
    }
    yield* protectWorkspacePath(args.targetPath);
    if (
      args.removeEmptyFile === true &&
      args.preserveEmptyFile !== true &&
      updated.trim().length === 0
    ) {
      yield* fs.remove(args.targetPath, { force: true });
      if (existed) yield* recordFootprint({ path: args.targetPath, change: "removed" });
    } else {
      yield* fs.makeDirectory(path.dirname(args.targetPath), { recursive: true });
      yield* fs.writeFileString(args.targetPath, updated);
      yield* recordFootprint({
        path: args.targetPath,
        change: existed ? "modified" : "created",
      });
    }
    return result;
  }).pipe(
    Effect.mapError((cause) =>
      cause._tag === "AppError"
        ? cause
        : makeAppError({
            code: "internal",
            detail: `Failed to reconcile managed-region target: ${args.targetPath}`,
            cause,
          }),
    ),
  );

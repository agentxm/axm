/** Projection-owned read/modify/write adapter for managed text regions. */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  ManagedRegionViolation,
  ProjectionIoFailed,
  ProjectionTargetUnsupported,
} from "./errors.js";
import { protectWorkspacePath, type WorkspaceSnapshotError } from "@agentxm/workspace-state";
import { recordFootprint } from "@agentxm/workspace-state";
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

export const renderManagedRegion = (args: {
  readonly content: string;
  readonly state: ManagedRegionState;
  readonly region: RegionName;
  readonly owner: string;
  readonly rendered: string;
  readonly style: FileCommentStyle;
  readonly generation?: string;
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
      ...(args.generation === undefined ? {} : { generation: args.generation }),
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
  const bodyIsCurrent =
    args.generation === undefined
      ? args.state.body === args.rendered
      : args.state.startMarker.ext === args.owner &&
        args.state.startMarker.generation === args.generation;
  const markersAreCurrent =
    args.generation === undefined ? currentStart === start && currentEnd === end : true;
  if (markersAreCurrent && bodyIsCurrent) {
    return args.content;
  }
  return [
    ...args.state.lines.slice(0, args.state.start),
    ...replacement,
    ...args.state.lines.slice(args.state.end + 1),
  ].join(eol);
};

const regionStateError = (displayPath: string, state: ManagedRegionState): ManagedRegionViolation =>
  new ManagedRegionViolation({
    displayPath,
    ...(state.state === "unsupported-version" || state.state === "malformed"
      ? { reason: state.message }
      : {}),
  });

/** Reconcile one AXM-owned region while preserving all surrounding bytes. */
export const reconcileManagedRegionFile = (args: {
  readonly targetPath: string;
  readonly displayPath: string;
  readonly region: RegionName;
  readonly owner: string;
  readonly rendered: string;
  /** Authoritative-input token for opaque generated document bodies. */
  readonly generation?: string;
  readonly dryRun?: boolean;
  readonly removeEmptyFile?: boolean;
  readonly preserveEmptyFile?: boolean;
  readonly writeWhenMissing?: boolean;
  readonly unsupportedTargetDetail?: string;
}): Effect.Effect<
  ManagedRegionReconciliation,
  | ManagedRegionViolation
  | ProjectionTargetUnsupported
  | ProjectionIoFailed
  | WorkspaceSnapshotError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const style = commentStyleForTarget(args.displayPath);
    if (Option.isNone(style)) {
      return yield* new ProjectionTargetUnsupported({
        detail:
          args.unsupportedTargetDetail ??
          `Managed-region target does not support comments: ${args.displayPath}`,
      });
    }
    const existed = yield* fs
      .exists(args.targetPath)
      .pipe(
        Effect.mapError(
          (cause) => new ProjectionIoFailed({ path: args.targetPath, step: "inspect", cause }),
        ),
      );
    const existing = existed
      ? yield* fs
          .readFileString(args.targetPath)
          .pipe(
            Effect.mapError(
              (cause) => new ProjectionIoFailed({ path: args.targetPath, step: "read", cause }),
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
      ...(args.generation === undefined ? {} : { generation: args.generation }),
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
      yield* fs
        .remove(args.targetPath, { force: true })
        .pipe(
          Effect.mapError(
            (cause) => new ProjectionIoFailed({ path: args.targetPath, step: "reconcile", cause }),
          ),
        );
      if (existed) yield* recordFootprint({ path: args.targetPath, change: "removed" });
    } else {
      yield* Effect.gen(function* () {
        yield* fs.makeDirectory(path.dirname(args.targetPath), { recursive: true });
        yield* fs.writeFileString(args.targetPath, updated);
      }).pipe(
        Effect.mapError(
          (cause) => new ProjectionIoFailed({ path: args.targetPath, step: "reconcile", cause }),
        ),
      );
      yield* recordFootprint({
        path: args.targetPath,
        change: existed ? "modified" : "created",
      });
    }
    return result;
  });

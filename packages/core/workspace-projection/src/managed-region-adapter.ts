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
import { protectWorkspacePath, type WorkspaceSnapshotError } from "@agentxm/workspace-transactions";
import { recordFootprint } from "@agentxm/workspace-transactions";
import {
  commentStyleForTarget,
  inspectManagedRegion,
  renderManagedRegion,
  type ManagedRegionState,
  type RegionName,
} from "@agentxm/agent-integration";

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

const regionStateError = (displayPath: string, state: ManagedRegionState): ManagedRegionViolation =>
  new ManagedRegionViolation({
    displayPath,
    ...(state.state === "unsupported-version" || state.state === "malformed"
      ? { reason: state.message, reasonCode: state.reasonCode }
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

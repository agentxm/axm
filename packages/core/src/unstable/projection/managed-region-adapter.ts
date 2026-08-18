/** Projection-owned read/modify/write adapter for managed text regions. */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { makeAppError, type AppError } from "../app-error/index.js";
import { protectWorkspacePath } from "../workspace/transaction.js";
import {
  commentStyleForTarget,
  managedRegionContent,
  replaceManagedRegion,
  stripManagedRegion,
} from "./markers.js";

export interface ManagedRegionReconciliation {
  readonly existed: boolean;
  readonly existing: string;
  readonly updated: string;
  readonly changed: boolean;
  readonly observedRegion: Option.Option<string>;
}

/**
 * Reconcile one AXM-owned region while preserving all surrounding bytes.
 * Marker parsing and serialization remain private to the projection package.
 */
export const reconcileManagedRegionFile = (args: {
  readonly targetPath: string;
  readonly displayPath: string;
  readonly region: string;
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
    const observedRegion = managedRegionContent(existing, { region: args.region }, style.value);
    const updated =
      args.rendered.length === 0
        ? stripManagedRegion(existing, { region: args.region }, style.value)
        : replaceManagedRegion({
            content: existing,
            marker: { region: args.region },
            rendered: args.rendered,
            style: style.value,
          });
    const changed = updated !== existing;
    if (args.dryRun === true || (!changed && (existed || args.writeWhenMissing !== true))) {
      return { existed, existing, updated, changed, observedRegion };
    }
    yield* protectWorkspacePath(args.targetPath);
    if (
      args.removeEmptyFile === true &&
      args.preserveEmptyFile !== true &&
      updated.trim().length === 0
    ) {
      yield* fs.remove(args.targetPath, { force: true });
    } else {
      yield* fs.makeDirectory(path.dirname(args.targetPath), { recursive: true });
      yield* fs.writeFileString(args.targetPath, updated);
    }
    return { existed, existing, updated, changed, observedRegion };
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

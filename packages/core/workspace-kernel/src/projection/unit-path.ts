/**
 * Projection row keys: where a native file sits beneath its scope root.
 *
 * A key is measured between physical spellings. Writers address targets by
 * their resolved entry, while a scope root can arrive through an alias — a
 * symlinked checkout, macOS `/var`, or a Windows 8.3 short name. Comparing the
 * two lexically would make AXM's own output look outside its scope, so both
 * sides are resolved first and every spelling of one file yields one key.
 *
 * @experimental This API is unstable and may change without notice.
 */
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import {
  resolveNativeEntry,
  resolveNativeReferent,
  type NativeLocationError,
} from "../locations/index.js";
import { ProjectionUnitPathSchema, type ProjectionUnitPath } from "../workspace-state/index.js";
import { ProjectionTargetUnsupported } from "./errors.js";

const decodeUnitPath = Schema.decodeUnknownOption(ProjectionUnitPathSchema);

/**
 * A native path as a POSIX scope-relative row key, or `None` when its physical
 * entry leaves the physical scope root. The leaf itself is never followed, so a
 * link AXM placed keys at its own location.
 */
export const scopeUnitPath = (
  scopeRoot: string,
  target: string,
): Effect.Effect<
  Option.Option<ProjectionUnitPath>,
  NativeLocationError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const root = yield* resolveNativeReferent(scopeRoot);
    const { entryPath } = yield* resolveNativeEntry(target);
    const relative = path.relative(root, entryPath);
    return decodeUnitPath(path.sep === "/" ? relative : relative.split(path.sep).join("/"));
  });

/** A planned target's row key; refuses a target that cannot be keyed inside its scope root. */
export const projectionUnitPath = (
  scopeRoot: string,
  target: string,
): Effect.Effect<
  ProjectionUnitPath,
  ProjectionTargetUnsupported,
  FileSystem.FileSystem | Path.Path
> =>
  scopeUnitPath(scopeRoot, target).pipe(
    Effect.mapError(
      (cause) =>
        new ProjectionTargetUnsupported({
          detail: `Projection target cannot be located beneath its scope root (${cause.reason}): ${target}`,
        }),
    ),
    Effect.flatMap(
      Option.match({
        onNone: () =>
          Effect.fail(
            new ProjectionTargetUnsupported({
              detail: `Projection target is not a path inside its scope root: ${target}`,
            }),
          ),
        onSome: Effect.succeed,
      }),
    ),
  );

/**
 * Observation of recorded projection units against what AXM last wrote.
 *
 * Each lockfile projection row records the digest of the bytes AXM last
 * wrote for one unit. Observing a unit hashes the bytes on disk the same way
 * the writer did: a whole file directly, and a region through its body. The
 * comparison establishes neither currency nor ownership; it tells a person
 * that a unit differs from AXM's last write, so AXM will replace their edit
 * when its inputs change.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { RegionName } from "../agent-adapters/index.js";
import {
  PROJECTION_KINDS,
  recordedProjectionRows,
  type ProjectionDigest,
  type ProjectionKind,
  type Projections,
  type ProjectionUnitPath,
} from "../workspace-state/index.js";
import { ManagedRegionViolation, ProjectionIoFailed } from "./errors.js";
import { projectionOutputDigest } from "./generation.js";
import { observedNativeManagedRegionBody } from "./native-managed-region.js";
import { readFileStringIfPresent } from "@agentxm/host-primitives";

/** How a recorded unit's bytes are read back for comparison. */
export type ProjectionOutputRead =
  { readonly _tag: "file" } | { readonly _tag: "region"; readonly region: RegionName };

/** One recorded unit whose bytes can be compared with AXM's last write. */
export interface ProjectionOutputUnit {
  readonly kind: ProjectionKind;
  readonly path: ProjectionUnitPath;
  readonly recorded: ProjectionDigest;
  readonly read: ProjectionOutputRead;
}

/** A recorded unit and the digest of its bytes as found. */
export interface ProjectionOutputObservation {
  readonly kind: ProjectionKind;
  readonly path: ProjectionUnitPath;
  readonly recorded: ProjectionDigest;
  readonly observed: ProjectionDigest;
}

const GITIGNORE_UNIT = ".gitignore";

const readFor = (
  kind: ProjectionKind,
  path: ProjectionUnitPath,
  instructionTarget: Option.Option<string>,
): Option.Option<ProjectionOutputRead> => {
  switch (kind) {
    case "rules":
    case "knowledge":
      // A region row keyed elsewhere is residue of a retarget; sync withdraws it.
      return Option.contains(instructionTarget, path)
        ? Option.some({ _tag: "region", region: kind })
        : Option.none();
    case "instructions":
      return Option.some(
        path === GITIGNORE_UNIT
          ? { _tag: "region", region: "instruction-aliases" }
          : { _tag: "file" },
      );
    case "subagents":
      return Option.some({ _tag: "file" });
  }
};

/**
 * Every recorded unit the workspace can compare, in kind order. `rules` and
 * `knowledge` rows count only when keyed at the planned instruction target.
 */
export const projectionOutputUnits = (args: {
  readonly projections: Projections | undefined;
  readonly instructionTarget: Option.Option<string>;
}): ReadonlyArray<ProjectionOutputUnit> =>
  PROJECTION_KINDS.flatMap((kind) =>
    Array.from(recordedProjectionRows(args.projections, kind)).flatMap(([path, { row }]) =>
      Option.match(readFor(kind, path, args.instructionTarget), {
        onNone: () => [],
        onSome: (read) => [{ kind, path, recorded: row.output, read }],
      }),
    ),
  );

/**
 * Hash one unit's bytes as its writer hashed them. `None` when the file or
 * the region is absent: there is nothing to compare. Every other read
 * failure and a malformed region stay in the error channel.
 */
export const observeProjectionOutput = (args: {
  readonly workspaceRoot: string;
  readonly unit: ProjectionOutputUnit;
}): Effect.Effect<
  Option.Option<ProjectionOutputObservation>,
  ProjectionIoFailed | ManagedRegionViolation,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { unit } = args;
    const physical = path.join(args.workspaceRoot, unit.path);
    const content = yield* readFileStringIfPresent(fs, physical).pipe(
      Effect.mapError((cause) => new ProjectionIoFailed({ path: unit.path, step: "read", cause })),
    );
    if (Option.isNone(content)) return Option.none();
    const observed = (bytes: string): Option.Option<ProjectionOutputObservation> =>
      Option.some({
        kind: unit.kind,
        path: unit.path,
        recorded: unit.recorded,
        observed: projectionOutputDigest(bytes),
      });
    if (unit.read._tag === "file") return observed(content.value);
    const body = yield* observedNativeManagedRegionBody({
      displayPath: unit.path,
      region: unit.read.region,
      raw: content.value,
    });
    return Option.flatMap(body, observed);
  });

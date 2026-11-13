import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import {
  computeSourceHash,
  ProjectionDigestSchema,
  type ProjectionDigest,
  type RecordedProjectionRow,
} from "../workspace-state/index.js";

const projectionDigest = (content: string): Effect.Effect<ProjectionDigest> =>
  computeSourceHash(content).pipe(
    Effect.map((hash) => ProjectionDigestSchema.make(`sha256:${hash}`)),
  );

/**
 * Input-only generation digest over explicitly selected authoritative inputs.
 * The rendered projection and any format tag are deliberately not inputs; the
 * projection format is versioned by the kind's lockfile contract instead.
 */
export const projectionGeneration = (
  parts: ReadonlyArray<string>,
): Effect.Effect<ProjectionDigest> => projectionDigest(JSON.stringify(parts));

/** Digest of the exact bytes AXM wrote for one projection unit. */
export const projectionOutputDigest = (bytes: string): Effect.Effect<ProjectionDigest> =>
  projectionDigest(bytes);

/**
 * A unit is current when it is present and its recorded row carries the same
 * generation under the current contract. The unit's bytes are never read.
 */
export const projectionIsCurrent = (
  recorded: Option.Option<RecordedProjectionRow>,
  gen: ProjectionDigest,
  present: boolean,
): boolean => present && Option.exists(recorded, (entry) => !entry.stale && entry.row.gen === gen);

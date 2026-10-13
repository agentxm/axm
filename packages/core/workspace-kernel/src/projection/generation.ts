import * as Option from "effect/Option";
import {
  computeSourceHash,
  ProjectionDigestSchema,
  type ProjectionDigest,
  type RecordedProjectionRow,
} from "../workspace-state/index.js";

const projectionDigest = (content: string): ProjectionDigest =>
  ProjectionDigestSchema.make(`sha256:${computeSourceHash(content)}`);

/**
 * Input-only generation digest over explicitly selected authoritative inputs.
 * The rendered projection and any format tag are deliberately not inputs; the
 * projection format is versioned by the kind's lockfile contract instead.
 */
export const projectionGeneration = (parts: ReadonlyArray<string>): ProjectionDigest =>
  projectionDigest(JSON.stringify(parts));

/** Digest of the exact bytes AXM wrote for one projection unit. */
export const projectionOutputDigest = (bytes: string): ProjectionDigest => projectionDigest(bytes);

/**
 * A unit is current when it is present and its recorded row carries the same
 * generation under the current contract. The unit's bytes are never read.
 */
export const projectionIsCurrent = (
  recorded: Option.Option<RecordedProjectionRow>,
  gen: ProjectionDigest,
  present: boolean,
): boolean => present && Option.exists(recorded, (entry) => !entry.stale && entry.row.gen === gen);

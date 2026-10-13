/**
 * The deletion guard for whole-file projections. AXM deletes a projected file
 * only when it can show the bytes are its own last write, or the render it
 * would write now. A row is deletion evidence, never ownership: a file AXM has
 * no record of is always kept, whatever override the caller passes.
 */
import * as Option from "effect/Option";
import type { RecordedProjectionRow } from "../workspace-state/index.js";
import { projectionOutputDigest } from "./generation.js";
import { DISCARD_MODIFIED_FLAG, type ProjectionOutputPostureValue } from "./output-posture.js";

export type DeletionDecision =
  | { readonly _tag: "delete" }
  | { readonly _tag: "retain"; readonly reason: "modified" | "unrecorded" };

export const decideOutputDeletion = (args: {
  /** `None` when the path is already absent. */
  readonly bytes: Option.Option<string>;
  readonly recorded: Option.Option<RecordedProjectionRow>;
  /** The render AXM would write now, when the caller can compute it. */
  readonly expectedRender: Option.Option<string>;
  /** Delete recorded files even when they were modified since the last write. */
  readonly discardModified: boolean;
}): DeletionDecision => {
  if (Option.isNone(args.bytes)) return { _tag: "delete" };
  if (Option.isNone(args.recorded)) return { _tag: "retain", reason: "unrecorded" };
  const bytes = args.bytes.value;
  if (projectionOutputDigest(bytes) === args.recorded.value.row.output) return { _tag: "delete" };
  if (Option.contains(args.expectedRender, bytes)) return { _tag: "delete" };
  if (args.discardModified) return { _tag: "delete" };
  return { _tag: "retain", reason: "modified" };
};

/**
 * The warning a retained projected file reports. It names `--discard-modified`
 * only when the invocation's command offers that flag.
 */
export const retainedOutputDetail = (
  path: string,
  reason: "modified" | "unrecorded",
  posture: ProjectionOutputPostureValue,
): string =>
  reason === "unrecorded"
    ? `Retained ${path}, which AXM has no record of writing`
    : posture.discardModified === false
      ? `Retained ${path}, modified since AXM last wrote it; rerun with ${DISCARD_MODIFIED_FLAG} to delete it`
      : `Retained ${path}, modified since AXM last wrote it`;

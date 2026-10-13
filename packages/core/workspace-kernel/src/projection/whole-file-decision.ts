/**
 * The one write decision every whole-file projection shares. Instruction
 * copies and Subagent files reach the same answer for the same recorded row,
 * observed bytes, and current render, so their preview and blocking behaviour
 * cannot drift apart.
 */
import * as Option from "effect/Option";
import type { ProjectionDigest, RecordedProjectionRow } from "../workspace-state/index.js";
import { projectionIsCurrent, projectionOutputDigest } from "./generation.js";

/** How the bytes a write replaces compare with what AXM last wrote there. */
export type WholeFileLastWrite = "matches" | "modified" | "unrecorded" | "absent";

export type WholeFileDecision =
  /** The recorded generation is current; nothing is written and no row changes. */
  | { readonly _tag: "current" }
  /** Write the render and record it. `lastWrite` describes what is replaced. */
  | { readonly _tag: "write"; readonly lastWrite: WholeFileLastWrite }
  /** Unrecorded bytes already equal the render; record them without writing. */
  | { readonly _tag: "record" }
  /** Unrecorded bytes differ from the render; writing needs explicit intent. */
  | { readonly _tag: "conflict" };

/**
 * Whether recorded bytes are still what AXM last wrote. Bytes equal to the
 * current render also count as matching, so a merged lockfile whose `output`
 * lags never reports an unedited file as modified.
 */
export const recordedOutputComparison = (
  recorded: RecordedProjectionRow,
  bytes: string,
  rendered: string,
): "matches" | "modified" =>
  projectionOutputDigest(bytes) === recorded.row.output || bytes === rendered
    ? "matches"
    : "modified";

/**
 * Decide what to do at one planned whole-file path.
 *
 * A current row decides without reading bytes. A recorded file is rewritten
 * when its inputs changed, even after a hand edit; `lastWrite` reports the
 * edit. A file AXM has no record of is recorded when it already equals the
 * render and is otherwise left alone unless `replaceUnrecorded` is set.
 */
export const decideWholeFileWrite = (args: {
  readonly recorded: Option.Option<RecordedProjectionRow>;
  readonly gen: ProjectionDigest;
  /** `None` when the path is absent. */
  readonly bytes: Option.Option<string>;
  readonly rendered: string;
  readonly replaceUnrecorded: boolean;
}): WholeFileDecision => {
  if (projectionIsCurrent(args.recorded, args.gen, Option.isSome(args.bytes)))
    return { _tag: "current" };
  if (Option.isNone(args.bytes)) return { _tag: "write", lastWrite: "absent" };
  const bytes = args.bytes.value;
  if (Option.isSome(args.recorded)) {
    return {
      _tag: "write",
      lastWrite: recordedOutputComparison(args.recorded.value, bytes, args.rendered),
    };
  }
  if (bytes === args.rendered) return { _tag: "record" };
  return args.replaceUnrecorded ? { _tag: "write", lastWrite: "unrecorded" } : { _tag: "conflict" };
};

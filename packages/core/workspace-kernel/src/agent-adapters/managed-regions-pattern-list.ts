/** Formatter-agnostic adapter for the instruction-alias pattern list in `.gitignore`. */

import * as Option from "effect/Option";
import * as Result from "effect/Result";
import {
  inspectManagedRegion,
  renderManagedRegion,
  verifyRenderedRegion,
  type ManagedRegionState,
} from "./managed-regions.js";

export interface PatternListReconciliation {
  /** The region as found before the render. */
  readonly state: ManagedRegionState;
  /** The file content after the render; equal to the input when nothing is written. */
  readonly updated: string;
  /** The region body as written, with the file's line endings; empty after a withdrawal. */
  readonly writtenBody: string;
}

/**
 * Render the `instruction-aliases` region of a `.gitignore` as exactly
 * `patterns`. `None` means the region is malformed or the render would break
 * the file's fences; nothing may be written.
 */
export const reconcilePatternList = (args: {
  readonly content: string;
  readonly patterns: ReadonlyArray<string>;
}): Option.Option<PatternListReconciliation> => {
  const state = inspectManagedRegion(args.content, "instruction-aliases", "hash");
  if (state.state === "malformed") return Option.none();
  const rendered = renderManagedRegion({
    content: args.content,
    state,
    region: "instruction-aliases",
    syntax: "hash",
    body: args.patterns.join("\n"),
  });
  if (Option.isNone(rendered))
    return Option.some({ state, updated: args.content, writtenBody: "" });
  const written = verifyRenderedRegion({
    before: args.content,
    after: rendered.value.content,
    region: "instruction-aliases",
    syntax: "hash",
    withdrawn: args.patterns.length === 0,
  });
  return Result.isFailure(written)
    ? Option.none()
    : Option.some({
        state,
        updated: rendered.value.content,
        writtenBody: written.success.state === "complete" ? written.success.body : "",
      });
};

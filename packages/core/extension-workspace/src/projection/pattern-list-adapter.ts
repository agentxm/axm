/** Formatter-agnostic adapter for an owned line list inside a user file. */

import {
  inspectManagedRegion,
  renderManagedRegion,
  type ManagedRegionState,
} from "./managed-region-adapter.js";
import { commentStyleForTarget, type RegionName } from "./marker-grammar.js";
import * as Option from "effect/Option";

export interface PatternListReconciliation {
  readonly state: ManagedRegionState;
  readonly updated: string;
  readonly changed: boolean;
}

export const reconcilePatternList = (args: {
  readonly content: string;
  readonly target: string;
  readonly region: RegionName;
  readonly owner: string;
  readonly patterns: ReadonlyArray<string>;
}): Option.Option<PatternListReconciliation> => {
  const style = commentStyleForTarget(args.target);
  if (Option.isNone(style)) return Option.none();
  const state = inspectManagedRegion(args.content, args.region, style.value);
  const updated = renderManagedRegion({
    content: args.content,
    state,
    region: args.region,
    owner: args.owner,
    rendered: args.patterns.join("\n"),
    style: style.value,
  });
  return Option.some({ state, updated, changed: updated !== args.content });
};

/** Keyed fenced-block adapter for TOML without an AST round trip. */

import {
  inspectManagedRegion,
  renderManagedRegion,
  type ManagedRegionState,
} from "./managed-region-adapter.js";
import { MARKER_KIND_START, parseMarker, type RegionName } from "./marker-grammar.js";

const TOML_STYLE = { kind: "line", prefix: "#" } as const;

export interface KeyedBlockReconciliation {
  readonly state: ManagedRegionState;
  readonly updated: string;
  readonly changed: boolean;
  readonly body: string | undefined;
}

export const reconcileKeyedBlock = (args: {
  readonly content: string;
  readonly region: RegionName;
  readonly owner: string;
  readonly rendered: string;
}): KeyedBlockReconciliation => {
  const state = inspectManagedRegion(args.content, args.region, TOML_STYLE);
  const updated = renderManagedRegion({
    content: args.content,
    state,
    region: args.region,
    owner: args.owner,
    rendered: args.rendered,
    style: TOML_STYLE,
  });
  return {
    state,
    updated,
    changed: updated !== args.content,
    body: state.state === "complete" ? state.body : undefined,
  };
};

export const managedKeyedBlockNames = (content: string): ReadonlyArray<string> => {
  const names: Array<string> = [];
  for (const line of content.split(/\r?\n/u)) {
    const parsed = parseMarker(line, TOML_STYLE);
    if (
      parsed.state === "complete" &&
      parsed.marker.kind === MARKER_KIND_START &&
      parsed.marker.region.startsWith("mcp-server:")
    ) {
      names.push(parsed.marker.region.slice("mcp-server:".length));
    }
  }
  return [...new Set(names)];
};

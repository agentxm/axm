import type { ManagedFileProvenance } from "../extensions/managed-file-banner.js";
import type { SubagentExtensionRef } from "../workspace/refs/subagent.js";

/** Provenance and authoring disposition for one managed Subagent projection. */
export const managedSubagentFile = (
  ref: SubagentExtensionRef,
  sourcePath: string,
): ManagedFileProvenance => ({
  ext: `${ref.owner}/subagents/${ref.subagent.name}`,
  source: {
    kind: ref.refType === "workspace" ? "workspace-authored" : "acquired",
    path: sourcePath,
  },
});

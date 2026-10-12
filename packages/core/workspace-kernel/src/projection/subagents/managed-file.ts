import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";

/**
 * Graph identity of one Subagent projection: the extension it realizes, the
 * canonical source it renders from, and whether the workspace authors that
 * source. It feeds the projection's generation; it is never written into the
 * projected file.
 */
export interface SubagentProvenance {
  readonly ext: string;
  readonly src: string;
  readonly kind: "workspace-authored" | "acquired";
}

export const subagentProvenance = (
  ref: SubagentExtensionRef,
  sourcePath: string,
): SubagentProvenance => ({
  ext: `${ref.owner}/subagents/${ref.subagent.name}`,
  src: sourcePath,
  kind: ref.refType === "workspace" ? "workspace-authored" : "acquired",
});

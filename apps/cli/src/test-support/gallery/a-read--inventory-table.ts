import type { ExtensionListItem } from "@agentxm/workspace/inspection";

import type { Doc } from "../../screen/doc.js";
import { listDoc } from "../../root/list/view.js";

const item = (
  ref: string,
  type: ExtensionListItem["type"],
  facts: Partial<ExtensionListItem> = {},
): ExtensionListItem => ({
  ref,
  type,
  name: ref.split("/").at(-1) ?? ref,
  management: "configured",
  installed: true,
  enabled: true,
  version: "1.0.0",
  source: "agentxm:@acme/skills/example@1.0.0",
  assessment: { state: "not-checked" },
  ...facts,
});

/**
 * An inventory that points at the row needing attention (*Interaction
 * patterns*, board `A · Read`, frame *Inventory table*).
 *
 * Types carry their tint, the leftover row carries a warning mark in the
 * gutter and a toned management cell, and the sentence after the table counts
 * what needs attention and names `axm lint`, which reports leftovers.
 */
export const aReadInventoryTable: Doc = listDoc({
  filter: "all",
  items: [
    item("@acme/skills/code-review", "skill", { version: "1.4.0" }),
    item("@acme/skills/triage", "skill", { version: "2.0.1" }),
    item("@acme/subagents/reviewer", "subagent", { version: "0.9.0" }),
    item("@acme/packs/review-kit", "pack", { version: "2.1.0", enabled: null }),
    item("github", "mcp-server", { enabled: false, source: "./github" }),
    item("@legacy/skills/changelog", "skill", {
      version: "0.3.0",
      management: "leftover",
      enabled: null,
    }),
  ],
});

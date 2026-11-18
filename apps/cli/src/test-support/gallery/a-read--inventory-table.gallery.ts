import type { ExtensionListDocument } from "@agentxm/workspace-features/inspection";

import type { Doc } from "../../screen/doc.js";
import { listDoc } from "../../root/list/view.js";
import { galleryModule, galleryWidths } from "./fixture.js";

type ListItem = ExtensionListDocument["items"][number];

const item = (ref: string, type: ListItem["type"], facts: Partial<ListItem> = {}): ListItem => ({
  fqn: ref,
  scope: "project",
  inspection: { state: "not-requested" },
  agents: { configured: [], observed: [] },
  type,
  name: ref.split("/").at(-1) ?? ref,
  management: "configured",
  installed: true,
  enabled: true,
  version: "1.0.0",
  source: {
    kind: "registry",
    locator: `agentxm:${ref}@^${facts.version ?? "1.0.0"}`,
    identity: ref,
  },
  assessment: { state: "not-checked" },
  ...facts,
});

/**
 * An inventory that points at the row needing attention (*Interaction
 * patterns*, board `A · Read`, frame *Inventory table*).
 *
 * Types carry their tint, the leftover row carries a warning mark in the
 * gutter and a toned state cell, the disabled server says so in its state,
 * and agent columns no row fills leave the table for the summary, which
 * counts what needs attention and names `axm lint`, which reports leftovers.
 */
const aReadInventoryTable: Doc = listDoc({
  filter: "all",
  items: [
    item("@acme/skills/code-review", "skill", { version: "1.4.0" }),
    item("@acme/skills/triage", "skill", { version: "2.0.1" }),
    item("@acme/subagents/reviewer", "subagent", { version: "0.9.0" }),
    item("@acme/packs/review-kit", "pack", { version: "2.1.0", enabled: null }),
    item("github", "mcp-server", { enabled: false, source: { kind: "path", locator: "./github" } }),
    item("@legacy/skills/changelog", "skill", {
      version: "0.3.0",
      management: "leftover",
      enabled: null,
    }),
  ],
});

export default galleryModule({
  _tag: "document",
  name: "a-read--inventory-table",
  doc: aReadInventoryTable,
  // Its 200-column painting differs from its 120-column one.
  snapshotWidths: galleryWidths,
});

import type { SourcedListRow } from "@agentxm/workspace-features/inspection";

import { inventoryDoc } from "../screen/index.js";
import { galleryModule } from "../test-support/gallery/fixture.js";
import { inventoryDiagnosticsDoc, inventorySummary, sourcedListColumns } from "./inventory-view.js";

const hook = (
  name: string,
  facts: Pick<SourcedListRow, "lifecycle" | "enabled" | "installed" | "source" | "locked">,
): SourcedListRow => ({
  name,
  agents: ["claude-code"],
  agentOutcomes: [],
  ...facts,
});

const hooks: ReadonlyArray<SourcedListRow> = [
  hook("format-on-save", {
    lifecycle: "configured",
    enabled: true,
    installed: true,
    source: "@acme/hooks/format-on-save",
    locked: true,
  }),
  hook("block-secrets", {
    lifecycle: "implicit",
    enabled: true,
    installed: true,
    source: "@acme/packs/review-kit",
    locked: true,
  }),
  hook("legacy-notify", {
    lifecycle: "unmanaged",
    enabled: false,
    installed: true,
    source: ".claude/settings.json",
    locked: false,
  }),
];

/**
 * A per-type inventory: the shared sourced-row columns, the inventory's facts
 * as one summary the painter joins, and what it could not observe as a
 * condition after it.
 */
export default galleryModule({
  _tag: "document",
  name: "a-read--type-inventory",
  doc: inventoryDoc({
    rows: hooks,
    columns: sourcedListColumns,
    summary: inventorySummary(
      {
        count: hooks.length,
        managementCounts: { configured: 1, implicit: 1, leftover: 0, undeclared: 0, unmanaged: 1 },
        items: hooks,
      },
      "hook",
    ),
    conditions: inventoryDiagnosticsDoc({
      observationDiagnostics: [
        { code: "unreadable", path: ".codex/hooks.json", message: "The file is not valid JSON" },
      ],
      items: [],
    }),
    empty: { statement: "No hooks found" },
  }),
});

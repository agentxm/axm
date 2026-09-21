import type { Doc, TableColumn } from "../../screen/doc.js";

/**
 * Inventory list: the shape every `<type> list` command paints. Six columns
 * with one wide free-text column and one optional column, which is the case
 * that overflowed a 100-column terminal before the responsive layout.
 */

export const inventoryColumns: ReadonlyArray<TableColumn> = [
  { header: "Name", priority: "required" },
  { header: "State" },
  { header: "Activation" },
  { header: "Type", priority: "optional" },
  { header: "Agents" },
  { header: "Agent outcomes", priority: "optional" },
];

export const inventoryRows: ReadonlyArray<ReadonlyArray<string>> = [
  [
    "@craigsmitham/effect-v4",
    "managed by this workspace",
    "enabled",
    "registry",
    "claude-code, codex, cursor, gemini-cli",
    "claude-code: available, codex: available, cursor: available, gemini-cli: available",
  ],
  [
    "@craigsmitham/field-notes",
    "managed by this workspace",
    "enabled",
    "registry",
    "claude-code, codex",
    "claude-code: available, codex: already available",
  ],
  [
    "@agentxm/knowledge/agentxm",
    "managed by this workspace",
    "disabled",
    "registry",
    "none",
    "none",
  ],
  ["local-notes", "outside AXM", "not applicable", "detected", "none", "none"],
];

export const inventoryCaption =
  "4 skills: 3 managed by this workspace, 3 installed, 1 found outside AXM";

export const inventory: Doc = [
  {
    _tag: "table",
    columns: inventoryColumns,
    rows: inventoryRows.map((cells) => ({ cells })),
  },
  { _tag: "blank" },
  { _tag: "paragraph", text: inventoryCaption },
];

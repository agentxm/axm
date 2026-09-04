import type { Doc, TableColumn } from "../doc.js";

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
    "installed",
    "enabled",
    "registry",
    "claude-code, codex, cursor, gemini-cli",
    "claude-code:projected, codex:projected, cursor:projected, gemini-cli:projected",
  ],
  [
    "@craigsmitham/field-notes",
    "installed",
    "enabled",
    "registry",
    "claude-code, codex",
    "claude-code:projected, codex:current",
  ],
  ["@agentxm/knowledge/agentxm", "installed", "disabled", "registry", "none", "none"],
  ["local-notes", "detected", "n/a", "detected", "none", "none"],
];

export const inventoryCaption = "4 skills (3 configured, 0 implicit, 3 installed, 1 unmanaged)";

export const inventory: Doc = [
  {
    _tag: "table",
    caption: inventoryCaption,
    columns: inventoryColumns,
    rows: inventoryRows,
  },
];

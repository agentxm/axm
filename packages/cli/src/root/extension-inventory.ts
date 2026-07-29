import type { CliRenderer, TableView } from "@agentxm/client-core/unstable/cli-renderer";
import type {
  ExtensionInventory,
  ExtensionInventoryRow,
} from "@agentxm/client-core/unstable/workspace";

export const inventoryState = (row: ExtensionInventoryRow): string =>
  row.classification.kind === "ignored" ? "ignored" : row.classification.lifecycle;

export const inventoryIgnoredBy = (row: ExtensionInventoryRow): string =>
  row.classification.kind === "ignored" ? row.classification.matchedBy.join(", ") : "";

export const inventoryActivation = (row: ExtensionInventoryRow): string =>
  row.enabled === null ? "n/a" : row.enabled ? "enabled" : "disabled";

export const inventorySummary = (inventory: ExtensionInventory, label: string): string =>
  `${inventory.count} ${inventory.count === 1 ? label : `${label}s`} (${inventory.configuredCount} configured, ${inventory.implicitCount} implicit, ${inventory.installedCount} installed, ${inventory.unmanagedCount} unmanaged, ${inventory.ignoredCount} ignored)`;

export const renderInventoryTable = <T extends object>(
  renderer: typeof CliRenderer.Service,
  items: ReadonlyArray<T>,
  view: TableView<T>,
  summary: string,
) => renderer.diagnosticTable(items, view, summary);

export const renderEmptyInventory = (renderer: typeof CliRenderer.Service, message: string) =>
  renderer.diagnostic(message);

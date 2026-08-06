import type { CliRenderer, TableView } from "@agentxm/client-core/unstable/cli-renderer";
import type {
  ExtensionInventory,
  ExtensionInventoryRow,
} from "@agentxm/client-core/unstable/workspace";

export const inventoryState = (row: ExtensionInventoryRow): string => row.classification.lifecycle;

export const inventoryActivation = (row: ExtensionInventoryRow): string =>
  row.enabled === null ? "n/a" : row.enabled ? "enabled" : "disabled";

/**
 * Row fields a list command fills in from its own lookups. Every other row
 * field belongs to the read model and must survive augmentation unchanged.
 */
type InventoryRowAugmentation = Pick<
  ExtensionInventoryRow,
  "source" | "version" | "owner" | "transport" | "status" | "locked" | "sourceType"
>;

/**
 * The one path from a read-model inventory to an emitted inventory payload.
 * Keeping it single-sourced is what holds `items` and the row shape identical
 * across every `axm <type> list --json`.
 */
export const augmentInventory = (
  inventory: ExtensionInventory,
  augment: (row: ExtensionInventoryRow) => InventoryRowAugmentation,
): ExtensionInventory => ({
  ...inventory,
  items: inventory.items.map((row) => ({ ...row, ...augment(row) })),
});

export const inventorySummary = (inventory: ExtensionInventory, label: string): string =>
  `${inventory.count} ${inventory.count === 1 ? label : `${label}s`} (${inventory.configuredCount} configured, ${inventory.implicitCount} implicit, ${inventory.installedCount} installed, ${inventory.unmanagedCount} unmanaged)`;

export const renderInventoryTable = <T extends object>(
  renderer: typeof CliRenderer.Service,
  items: ReadonlyArray<T>,
  view: TableView<T>,
  summary: string,
) => renderer.diagnosticTable(items, view, summary);

export const renderEmptyInventory = (renderer: typeof CliRenderer.Service, message: string) =>
  renderer.diagnostic(message);

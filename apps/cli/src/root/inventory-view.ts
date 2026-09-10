import type {
  ConfiguredAgentOutcome,
  ExtensionInventory,
  ExtensionInventoryRow,
} from "@agentxm/workspace-state";

export const inventoryState = (row: ExtensionInventoryRow): string => row.classification.lifecycle;

export const inventoryActivation = (row: ExtensionInventoryRow): string =>
  row.enabled === null ? "n/a" : row.enabled ? "enabled" : "disabled";

export const inventoryAgentOutcomes = (outcomes: ReadonlyArray<ConfiguredAgentOutcome>): string =>
  outcomes.length === 0
    ? "none"
    : outcomes.map(({ agentId, outcome }) => `${agentId}:${outcome}`).join(", ");

type InventoryRowAugmentation = Partial<
  Pick<
    ExtensionInventoryRow,
    | "source"
    | "version"
    | "owner"
    | "transport"
    | "status"
    | "locked"
    | "sourceType"
    | "agentOutcomes"
  >
>;

export const augmentInventory = (
  inventory: ExtensionInventory,
  augment: (row: ExtensionInventoryRow) => InventoryRowAugmentation,
): ExtensionInventory => ({
  ...inventory,
  items: inventory.items.map((row) => ({ ...row, ...augment(row) })),
});

export const inventorySummary = (inventory: ExtensionInventory, label: string): string =>
  `${inventory.count} ${inventory.count === 1 ? label : `${label}s`} (${inventory.configuredCount} configured, ${inventory.implicitCount} implicit, ${inventory.installedCount} installed, ${inventory.unmanagedCount} unmanaged)`;

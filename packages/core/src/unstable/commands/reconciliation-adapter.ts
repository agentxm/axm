import { makeRegistryReconciliationAdapter } from "../workspace/registry-reconciliation-adapter.js";

export const commandReconciliationAdapter = makeRegistryReconciliationAdapter({
  type: "commands",
  label: "command",
  selectEntries: (settings) => settings.commands,
});

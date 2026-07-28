import { makeRegistryReconciliationAdapter } from "../workspace/registry-reconciliation-adapter.js";

export const hookReconciliationAdapter = makeRegistryReconciliationAdapter({
  type: "hooks",
  label: "hook",
  selectEntries: (settings) => settings.hooks,
});

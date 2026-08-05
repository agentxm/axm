import { makeRegistryReconciliationAdapter } from "../workspace/registry-reconciliation-adapter.js";

export const ruleReconciliationAdapter = makeRegistryReconciliationAdapter({
  type: "rules",
  label: "rule",
  selectEntries: (settings) => settings.rules,
});

import { makeRegistryReconciliationAdapter } from "../workspace/registry-reconciliation-adapter.js";

export const skillReconciliationAdapter = makeRegistryReconciliationAdapter({
  type: "skills",
  label: "skill",
  selectEntries: (settings) => settings.skills,
});

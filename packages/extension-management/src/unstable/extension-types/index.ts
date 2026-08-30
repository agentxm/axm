export { EXTENSION_TYPES, EXTENSION_TYPES_BY_ID } from "./catalog.js";
export {
  getExtensionTypeDefinition,
  getStandardForExtensionType,
  isSpecTracked,
} from "./derive.js";
export {
  exemptedObligations,
  parityExemptionRows,
  PARITY_EXEMPTIONS,
  type ParityExemption,
} from "./parity/exemptions.js";
export {
  EXTENSION_LIFECYCLE_CONTRACT,
  LIFECYCLE_MUTATION_VERBS,
  type ExtensionLifecycleContract,
  type LifecycleMutationVerb,
  type LifecycleScopeSupport,
  type LifecycleUpdateSelection,
} from "./parity/lifecycle.js";
export {
  obligationsVerifiedBy,
  OBLIGATION_IDS,
  OBLIGATION_TIERS,
  PARITY_OBLIGATIONS,
  type ObligationDef,
  type ObligationId,
  type ObligationTier,
} from "./parity/obligations.js";
export {
  RECONCILIATION_SOURCE_CLASSES,
  WORKSPACE_RECONCILIATION_OBLIGATIONS,
  type ReconciliationApplicability,
  type ReconciliationObligation,
  type ReconciliationSourceClass,
} from "./parity/reconciliation.js";

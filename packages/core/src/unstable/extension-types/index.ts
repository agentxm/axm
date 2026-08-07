export { EXTENSION_TYPES, EXTENSION_TYPES_BY_ID } from "./catalog.js";
// Sourced from the owning module rather than re-exported through `schema.js`:
// that re-export is type-only so the catalog does not close a runtime import
// cycle back into `extensions/common.js`.
export { PER_AGENT_EXTENSION_TYPES } from "../extensions/common.js";
export {
  getExtensionTypeDefinition,
  getStandardForExtensionType,
  isSpecTracked,
} from "./derive.js";
export {
  DocLinkSchema,
  CATALOG_EXTENSION_TYPES,
  CatalogExtensionTypeSchema,
  ExtensionTypeCatalogSchema,
  ExtensionTypeDefinitionSchema,
  isCatalogExtensionType,
  LEAF_EXTENSION_TYPES,
  LeafExtensionTypeSchema,
  StandardSchema,
  UrlSchema,
  type DocLink,
  type CatalogExtensionType,
  type ExtensionTypeCatalog,
  type ExtensionTypeDefinition,
  type LeafExtensionType,
  type PerAgentType,
  type Standard,
  type Url,
} from "./schema.js";
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
export { STANDARDS } from "./standards.js";

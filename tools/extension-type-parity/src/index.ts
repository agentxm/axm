/**
 * @agentxm/extension-type-parity public API.
 *
 * Extension-type parity is engineering verification support, not runtime
 * behavior: the obligations every catalog extension type is expected to carry,
 * the capability-derived lifecycle contract the tiers share, the workspace
 * reconciliation table, and the exemption ledger that records outstanding
 * debt. Conformance suites in other projects read these tables; production
 * code never does.
 */

export { exemptedObligations } from "./exemptions.js";
export { EXTENSION_LIFECYCLE_CONTRACT } from "./lifecycle.js";
export { obligationsVerifiedBy, type ObligationId } from "./obligations.js";

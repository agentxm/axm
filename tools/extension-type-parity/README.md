# @agentxm/extension-type-parity

Extension-type parity tables for the AXM conformance suites: the obligation
register, the capability-derived lifecycle contract, and the exemption ledger that records which obligations a
catalog extension type does not meet yet.

This is engineering support. Nothing here ships in the CLI runtime; the tables
are read by conformance tests, by the `parity-ledger-check` repository target,
and by the generator that emits the `apps/cli-e2e` extension-type matrix.

The ledger is shrink-only. See `src/exemptions.ts` for how a row is admitted and
`scripts/parity-ledger-check-lib.ts` at the repository root for the enforcement.

TypeScript owns completeness of the catalog and tier-specific checker records.
The suites check decoded lock entries and delivered CLI behavior. List-handler
and Screen specifications own rendered inventory behavior; searching source for
renderer helper names adds no behavioral evidence. Transaction
atomicity, reconciliation, preview, and ownership preservation remain covered
by the workspace specifications and lifecycle E2E; literal flags or copied
configuration tables do not establish those behaviors.

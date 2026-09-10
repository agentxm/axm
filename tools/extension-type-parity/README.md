# @agentxm/extension-type-parity

Extension-type parity tables for the AXM conformance suites: the obligation
register, the capability-derived lifecycle contract, the workspace
reconciliation table, and the exemption ledger that records which obligations a
catalog extension type does not meet yet.

This is engineering support. Nothing here ships in the CLI runtime; the tables
are read by conformance tests, by the `parity-ledger-check` repository target,
and by the generator that emits the `apps/cli-e2e` extension-type matrix.

The ledger is shrink-only. See `src/exemptions.ts` for how a row is admitted and
`scripts/parity-ledger-check-lib.ts` at the repository root for the enforcement.

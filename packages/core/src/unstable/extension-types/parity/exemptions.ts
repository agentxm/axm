/**
 * Parity exemption ledger — the debt register for extension-type parity.
 *
 * Every row records one {@link ObligationId} a catalog extension type does not
 * meet yet. The conformance suites compare what they observe against this
 * ledger with exact equality, in both directions:
 *
 * - a type that starts failing an obligation without a row fails the suite;
 * - a type that starts *meeting* an obligation whose row is still here also
 *   fails the suite, so fixes cannot leave stale debt behind.
 *
 * `seed: true` marks a row that existed when the ledger was introduced. The
 * `parity-ledger-check` script compares the seeded-row count against `main` and
 * fails when it rises, which makes the ledger shrink-only: a new gap can never
 * be admitted as pre-existing debt.
 *
 * This is the one designated file where extension-type name literals may appear
 * in the parity harness; the conformance suites derive every type they iterate
 * from the catalog and enforce that rule with a self-referential scan.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as EffectRecord from "effect/Record";

import type { CatalogExtensionType } from "../schema.js";
import { PARITY_OBLIGATIONS, type ObligationId, type ObligationTier } from "./obligations.js";

/** @experimental This API is unstable and may change without notice. */
export interface ParityExemption {
  readonly obligation: ObligationId;
  /** Why the gap exists today, in terms a reader can act on. */
  readonly reason: string;
  /** Issue tracking the fix. */
  readonly trackedBy: string;
  /** Present only on rows that existed when the ledger was introduced. */
  readonly seed?: true;
}

const AXM_985 = "AXM-985";

/**
 * Exemptions keyed by catalog extension type.
 *
 * The `satisfies Record<CatalogExtensionType, …>` is load-bearing: dropping a
 * key fails compile because the record no longer covers the union, and adding a
 * key that is not a catalog type fails compile as an excess property. A new
 * extension type therefore cannot land without a deliberate decision about
 * every obligation it meets.
 */
export const PARITY_EXEMPTIONS = {
  skill: [],
  command: [],
  "mcp-server": [],
  subagent: [],
  files: [],
  rule: [
    {
      obligation: "6.1-e2e-install-row",
      reason:
        "The type is not publishable, so there is no registry round trip to exercise. This is a " +
        "capability boundary rather than debt; it is ledgered because publishability is a CLI " +
        "decision the catalog does not yet carry as an axis.",
      trackedBy: AXM_985,
      seed: true,
    },
  ],
  hook: [],
  knowledge: [],
} as const satisfies Record<CatalogExtensionType, ReadonlyArray<ParityExemption>>;

// Coverage witness: the `satisfies` above rejects a foreign key on its own;
// this fails compile in the other direction too, when a catalog type loses its
// ledger key.
type _LedgerCoversCatalog =
  Exclude<CatalogExtensionType, keyof typeof PARITY_EXEMPTIONS> extends never
    ? Exclude<keyof typeof PARITY_EXEMPTIONS, CatalogExtensionType> extends never
      ? true
      : false
    : false;
const _ledgerCoversCatalog = true as const satisfies _LedgerCoversCatalog;
export type _ParityLedgerCoverage = typeof _ledgerCoversCatalog;

/**
 * Ledgered obligation ids per type, narrowed to one verification tier.
 *
 * Each conformance suite compares its observed failures against this slice, so
 * a suite never sees rows another suite is responsible for.
 */
export const exemptedObligations = (
  tier: ObligationTier,
): Record<CatalogExtensionType, ReadonlyArray<ObligationId>> =>
  EffectRecord.map(PARITY_EXEMPTIONS, (rows) =>
    rows
      .filter((row) => PARITY_OBLIGATIONS[row.obligation].verifiedBy === tier)
      .map((row) => row.obligation),
  );

/** Every ledgered row, flattened with its type, for reporting and scripts. */
export const parityExemptionRows = (): ReadonlyArray<
  ParityExemption & { readonly type: CatalogExtensionType }
> =>
  EffectRecord.toEntries(PARITY_EXEMPTIONS).flatMap(([type, rows]) =>
    rows.map((row) => ({ ...row, type })),
  );

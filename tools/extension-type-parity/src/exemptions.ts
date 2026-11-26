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
 * @experimental This API is unstable and may change without notice.
 */

import * as EffectRecord from "effect/Record";

import type { CatalogExtensionType } from "@agentxm/extension-model/unstable/extension-types/schema";
import { PARITY_OBLIGATIONS, type ObligationId, type ObligationTier } from "./obligations.js";

/** @experimental This API is unstable and may change without notice. */
export interface ParityExemption {
  readonly obligation: ObligationId;
  /** Why the gap exists today, in terms a reader can act on. */
  readonly reason: string;
  /** Issue tracking the fix. */
  readonly trackedBy: string;
}

/**
 * Exemptions keyed by catalog extension type.
 *
 * The record annotation is load-bearing: dropping a key fails compile because
 * the record no longer covers the union, and adding a key that is not a
 * catalog type fails compile as an excess property. A new extension type
 * therefore cannot land without a deliberate decision about every obligation
 * it meets.
 *
 * The ledger is EMPTY: every catalog type meets every mechanically-verified
 * obligation. A future row uses the {@link ParityExemption} shape.
 */
const PARITY_EXEMPTIONS: Record<CatalogExtensionType, ReadonlyArray<ParityExemption>> = {
  skill: [],
  "mcp-server": [],
  subagent: [],
  rule: [],
  hook: [],
  knowledge: [],
};

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

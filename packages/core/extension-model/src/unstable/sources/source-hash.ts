/**
 * Branded string for content source hashes.
 *
 * A `SourceHash` is an advisory change-detection marker: the SHA-256 of
 * canonical content captured at install/enable time. It powers
 * created/updated/unchanged reporting and drift hints. It is NOT a tamper
 * seal — installed canonical content is workspace-owned and may be
 * rewritten by content-preserving tools (formatters, line-ending
 * normalization) after install, so a stored hash can legitimately go stale.
 * Consumers must never hard-fail on a mismatch; supply-chain integrity is
 * enforced separately by verifying registry archive SRI hashes at download
 * time.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";

export const SourceHashSchema = Schema.String.pipe(Schema.brand("SourceHash")).annotate({
  description:
    "Advisory SHA-256 change-detection marker of canonical content at install time. " +
    "Not a tamper guarantee: installed content is workspace-owned and may be rewritten " +
    "by content-preserving tools after install.",
});

/**
 * Branded SourceHash type.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SourceHash = Schema.Schema.Type<typeof SourceHashSchema>;

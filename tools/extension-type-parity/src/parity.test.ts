/**
 * Core-tier parity conformance.
 *
 * Drives every catalog extension type through the obligations this project can
 * verify mechanically, then compares the observed failures against the
 * exemption ledger with exact equality. A regression adds an unexpected
 * failure; a fix that forgets to clear its ledger row leaves a stale one. Both
 * diff, so neither can land silently.
 *
 * The compiler enforces complete checker and catalog records. These cases
 * exercise schema decoding, which record typing alone cannot establish.
 */

import * as EffectRecord from "effect/Record";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import { LOCK_ENTRY_SCHEMA_BY_TYPE } from "@agentxm/workspace/desired-state";
import {
  CATALOG_EXTENSION_TYPES,
  type CatalogExtensionType,
} from "@agentxm/extension-model/unstable/extension-types/schema";
import { exemptedObligations } from "./exemptions.js";
import type { ObligationId, ObligationIdForTier } from "./obligations.js";

const TIER = "core-test";

/**
 * A lock entry as a registry install writes one. Every catalog type's lock
 * entry accepts this shape today, so a decode failure after adding one field
 * isolates that field.
 */
const REGISTRY_LOCK_ENTRY = {
  type: "registry",
  sourceType: "registry",
  endpoint: "https://registry.agentxm.ai",
  workspaceName: "example",
  packageFormat: "agentxm",
  owner: "@acme",
  name: "example",
  resolvedVersion: "1.0.0",
  integrity: "sha512-abc123",
  sourceName: "agentxm",
  publisherBindingId: "hbnd_test",
  treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
} as const;

const registryLockEntry = (type: CatalogExtensionType) => ({
  ...REGISTRY_LOCK_ENTRY,
  extensionType: type,
});

type LockEntrySchema = (typeof LOCK_ENTRY_SCHEMA_BY_TYPE)[CatalogExtensionType];

// `onExcessProperty: "error"` is load-bearing: under the default tolerance an
// unknown field is silently dropped, which would make every type appear to
// accept obsolete receipt fields.
const decodes = (schema: LockEntrySchema, input: unknown): boolean => {
  try {
    Schema.decodeUnknownSync(schema)(input, { onExcessProperty: "error" });
    return true;
  } catch {
    return false;
  }
};

const CHECKS: Record<ObligationIdForTier<typeof TIER>, (type: CatalogExtensionType) => boolean> = {
  "2.6-accepted-resolution": (type) =>
    decodes(LOCK_ENTRY_SCHEMA_BY_TYPE[type], registryLockEntry(type)) &&
    decodes(LOCK_ENTRY_SCHEMA_BY_TYPE[type], {
      type: "github",
      sourceType: "github",
      sourceName: "github",
      endpoint: "https://github.com",
      extensionType: type,
      workspaceName: "example",
      packageFormat: "agentxm",
      packageOwner: "@acme",
      packageName: "example",
      owner: "acme",
      repo: "example",
      resolvedCommit: "commit-1",
      resolvedTree: "tree-1",
      contentIdentity: "content-1",
      treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
    }),
};

const coreObligations = EffectRecord.keys(CHECKS);

const observedFailures = (): Record<CatalogExtensionType, ReadonlyArray<ObligationId>> =>
  EffectRecord.fromEntries(
    CATALOG_EXTENSION_TYPES.map((type) => [
      type,
      coreObligations.filter((id) => !CHECKS[id](type)),
    ]),
  );

describe("extension type parity (core tier)", () => {
  it("matches the exemption ledger exactly", () => {
    expect(observedFailures()).toStrictEqual(exemptedObligations(TIER));
  });
});

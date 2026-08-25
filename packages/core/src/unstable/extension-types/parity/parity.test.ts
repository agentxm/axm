/**
 * Core-tier parity conformance.
 *
 * Drives every catalog extension type through the obligations this project can
 * verify mechanically, then compares the observed failures against the
 * exemption ledger with exact equality. A regression adds an unexpected
 * failure; a fix that forgets to clear its ledger row leaves a stale one. Both
 * diff, so neither can land silently.
 *
 * Nothing here names an extension type. Types come from the catalog and the
 * per-type surfaces come from total records at the modules that own them; the
 * final test in this file enforces that rule against this directory's sources.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import * as EffectRecord from "effect/Record";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import { LOCK_ENTRY_SCHEMA_BY_TYPE } from "../../lockfile/schema.js";
import { READ_MODEL_EXTENSION_FAMILY_BY_TYPE } from "../../workspace/read-model/service.js";
import { CATALOG_EXTENSION_TYPES, type CatalogExtensionType } from "../schema.js";
import { exemptedObligations } from "./exemptions.js";
import { EXTENSION_LIFECYCLE_CONTRACT, LIFECYCLE_MUTATION_VERBS } from "./lifecycle.js";
import { obligationsVerifiedBy, type ObligationId } from "./obligations.js";
import { WORKSPACE_RECONCILIATION_OBLIGATIONS } from "./reconciliation.js";

const TIER = "core-test";

/**
 * A lock entry as a registry install writes one. Every catalog type's lock
 * entry accepts this shape today, so a decode failure after adding one field
 * isolates that field.
 */
const REGISTRY_LOCK_ENTRY = {
  type: "registry",
  owner: "@acme",
  name: "example",
  resolvedVersion: "1.0.0",
  integrity: "sha512-abc123",
  sourceName: "default",
  publisherBindingId: "hbnd_test",
  treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
} as const;

const registryLockEntry = (_type: CatalogExtensionType) => REGISTRY_LOCK_ENTRY;

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

/**
 * Obligation checks, keyed by id. Each returns `true` when the type meets the
 * obligation. Adding a core-tier obligation without a checker here fails the
 * coverage test below.
 */
const CHECKS: Record<ObligationId, ((type: CatalogExtensionType) => boolean) | null> = {
  "2.6-accepted-resolution": (type) =>
    decodes(LOCK_ENTRY_SCHEMA_BY_TYPE[type], registryLockEntry(type)) &&
    decodes(LOCK_ENTRY_SCHEMA_BY_TYPE[type], {
      type: "github",
      packageOwner: "@acme",
      packageName: "example",
      owner: "acme",
      repo: "example",
      resolvedCommit: "commit-1",
      resolvedTree: "tree-1",
      contentIdentity: "content-1",
      treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
    }),
  "2.9-read-model-family": (type) => READ_MODEL_EXTENSION_FAMILY_BY_TYPE[type] !== null,
  "2.11-ownership-safe-prune": (type) => READ_MODEL_EXTENSION_FAMILY_BY_TYPE[type] !== null,
  "2.12-workspace-reconciliation": (type) =>
    WORKSPACE_RECONCILIATION_OBLIGATIONS[type] !== undefined,
  "2.13-transactional-postcondition": (type) => {
    const contract = EXTENSION_LIFECYCLE_CONTRACT[type];
    return (
      contract.preview &&
      contract.transactionalPostcondition &&
      LIFECYCLE_MUTATION_VERBS.every((verb) => contract.mutations.includes(verb))
    );
  },
  "6.1-e2e-install-row": null,
  "6.2-lifecycle-postconditions": null,
  "6.3-preview-apply-equivalence": null,
  "6.4-idempotent-validity": null,
  "6.5-scope-isolation": null,
  "6.6-pack-reachability": null,
  "7.1-help-topic": null,
  "8.6-entity-key": null,
  "8.7-lifecycle-verbs": null,
  "8.8-lifecycle-flags": null,
  "8.9-scope-surface": null,
};

const coreObligations = obligationsVerifiedBy(TIER);

const observedFailures = (): Record<CatalogExtensionType, ReadonlyArray<ObligationId>> =>
  EffectRecord.fromEntries(
    CATALOG_EXTENSION_TYPES.map((type) => [
      type,
      coreObligations.filter((id) => {
        const check = CHECKS[id];
        return check !== null && !check(type);
      }),
    ]),
  );

describe("extension type parity (core tier)", () => {
  it("has a checker for every obligation this tier verifies", () => {
    expect(coreObligations.filter((id) => CHECKS[id] === null)).toStrictEqual([]);
  });

  it("decodes the baseline registry lock entry for every type", () => {
    const undecodable = CATALOG_EXTENSION_TYPES.filter(
      (type) => !decodes(LOCK_ENTRY_SCHEMA_BY_TYPE[type], registryLockEntry(type)),
    );

    expect(undecodable).toStrictEqual([]);
  });

  it("matches the exemption ledger exactly", () => {
    expect(observedFailures()).toStrictEqual(exemptedObligations(TIER));
  });

  it("names no extension type outside the designated ledger", () => {
    const parityDir = import.meta.dirname;
    const TYPE_INDEXED_TABLES = new Set(["exemptions.ts", "reconciliation.ts"]);

    const forbidden = new Set<string>(CATALOG_EXTENSION_TYPES);
    const quoted = /["'`]([^"'`\n]*)["'`]/g;

    const offenders = fs
      .readdirSync(parityDir)
      .filter((entry) => !TYPE_INDEXED_TABLES.has(entry) && entry.endsWith(".ts"))
      .flatMap((entry) => {
        const source = fs.readFileSync(path.join(parityDir, entry), "utf-8");
        return Array.from(source.matchAll(quoted))
          .filter(([, literal = ""]) => forbidden.has(literal))
          .map(([match]) => `${entry}: ${match}`);
      });

    expect(offenders).toStrictEqual([]);
  });
});

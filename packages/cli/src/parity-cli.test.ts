/**
 * CLI-tier parity conformance.
 *
 * Verifies the CLI-surface obligations for every catalog extension type — a
 * prose help topic and a renderer list entity keyed by the type id — and
 * compares observed failures against the exemption ledger with exact equality,
 * mirroring the core-tier suite in
 * `@agentxm/client-core` extension-types/parity.
 */

import { getEntityView } from "@agentxm/client-core/unstable/cli-renderer";
import {
  CATALOG_EXTENSION_TYPES,
  exemptedObligations,
  obligationsVerifiedBy,
  type CatalogExtensionType,
  type ObligationId,
} from "@agentxm/client-core/unstable/extension-types";
import { toExtensionTypePlural } from "@agentxm/client-core/unstable/extensions";
import * as EffectRecord from "effect/Record";
import { describe, expect, it } from "vitest";

import { HELP_TOPIC_NAMES } from "./__generated__/help-topics.js";
// Loading the command tree registers every renderer entity as a module side
// effect; without this import the 8.6 check would observe an empty registry.
import "./app.js";

const TIER = "cli-test";

const topicNames: ReadonlySet<string> = new Set(HELP_TOPIC_NAMES);

/**
 * Obligation checks, keyed by id. Each returns `true` when the type meets the
 * obligation. Adding a cli-tier obligation without a checker here fails the
 * coverage test below.
 */
const CHECKS: Record<ObligationId, ((type: CatalogExtensionType) => boolean) | null> = {
  "2.6-source-hash": null,
  "2.9-read-model-family": null,
  "2.11-ignore-config": null,
  "6.1-e2e-install-row": null,
  "7.1-help-topic": (type) => topicNames.has(toExtensionTypePlural(type)),
  "8.6-entity-key": (type) => getEntityView(type) !== undefined,
};

const cliObligations = obligationsVerifiedBy(TIER);

const observedFailures = (): Record<CatalogExtensionType, ReadonlyArray<ObligationId>> =>
  EffectRecord.fromEntries(
    CATALOG_EXTENSION_TYPES.map((type) => [
      type,
      cliObligations.filter((id) => {
        const check = CHECKS[id];
        return check !== null && !check(type);
      }),
    ]),
  );

describe("extension type parity (cli tier)", () => {
  it("has a checker for every obligation this tier verifies", () => {
    expect(cliObligations.filter((id) => CHECKS[id] === null)).toStrictEqual([]);
  });

  it("matches the exemption ledger exactly", () => {
    expect(observedFailures()).toStrictEqual(exemptedObligations(TIER));
  });
});

/**
 * CLI-tier parity conformance.
 *
 * Verifies help topics and lifecycle command surfaces for every catalog
 * extension type and
 * compares observed failures against the exemption ledger with exact equality,
 * mirroring the core-tier suite in `@agentxm/extension-type-parity`.
 */

import * as Effect from "effect/Effect";

import {
  CATALOG_EXTENSION_TYPES,
  type CatalogExtensionType,
} from "@agentxm/extension-model/unstable/extension-types";
import {
  EXTENSION_LIFECYCLE_CONTRACT,
  exemptedObligations,
  type ObligationId,
  type ObligationIdForTier,
} from "@agentxm/extension-type-parity";
import {
  extensionTypes,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions";
import * as EffectRecord from "effect/Record";
import { describe, expect, it } from "@effect/vitest";

import { HELP_TOPIC_NAMES } from "./__generated__/help-topics.js";
import { collectHelpFiles, type HelpFiles } from "./test-support/command-tree-test-helpers.js";

const TIER = "cli-test";

const topicNames: ReadonlySet<string> = new Set(HELP_TOPIC_NAMES);

const lifecycleDocs = (files: HelpFiles, type: CatalogExtensionType) => {
  const plural = toExtensionTypePlural(type);
  return EXTENSION_LIFECYCLE_CONTRACT[type].mutations.map((verb) =>
    files.get(`axm ${plural} ${verb}`),
  );
};

const hasLifecycleVerbs = (files: HelpFiles, type: CatalogExtensionType): boolean =>
  lifecycleDocs(files, type).every((doc) => doc !== undefined);

const hasLifecycleFlags = (files: HelpFiles, type: CatalogExtensionType): boolean =>
  lifecycleDocs(files, type).every((doc) => {
    if (doc === undefined) return false;
    const flags = doc.flags.map((flag) => flag.name);
    return flags.includes("preview") && !flags.includes("force") && !flags.includes("wizard");
  });

const hasScopeSurface = (files: HelpFiles, type: CatalogExtensionType): boolean =>
  lifecycleDocs(files, type).every(
    (doc) => doc !== undefined && doc.flags.some((flag) => flag.name === "scope"),
  );

/**
 * Obligation checks, keyed by id. Each returns `true` when the type meets the
 * obligation. The compiler requires a checker for every CLI-tier obligation.
 */
const CHECKS: Record<
  ObligationIdForTier<typeof TIER>,
  (files: HelpFiles, type: CatalogExtensionType) => boolean
> = {
  "7.1-help-topic": (_files, type) => topicNames.has(toExtensionTypePlural(type)),
  "8.7-lifecycle-verbs": hasLifecycleVerbs,
  "8.8-lifecycle-flags": hasLifecycleFlags,
  "8.9-scope-surface": hasScopeSurface,
};

const cliObligations = EffectRecord.keys(CHECKS);

const observedFailures = (
  files: HelpFiles,
): Record<CatalogExtensionType, ReadonlyArray<ObligationId>> =>
  EffectRecord.fromEntries(
    CATALOG_EXTENSION_TYPES.map((type) => [
      type,
      cliObligations.filter((id) => !CHECKS[id](files, type)),
    ]),
  );

describe("extension type parity (cli tier)", () => {
  it.effect("matches the exemption ledger exactly", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
      expect(observedFailures(files)).toStrictEqual(exemptedObligations(TIER));
    }),
  );

  it.effect("registers lifecycle verbs for every extension type, including containers", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
      expect(
        extensionTypes.filter((type) =>
          EXTENSION_LIFECYCLE_CONTRACT[type].mutations.some(
            (verb) => files.get(`axm ${toExtensionTypePlural(type)} ${verb}`) === undefined,
          ),
        ),
      ).toStrictEqual([]);
    }),
  );
});

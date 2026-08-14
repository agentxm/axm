/**
 * CLI-tier parity conformance.
 *
 * Verifies the CLI-surface obligations for every catalog extension type — a
 * prose help topic and a renderer list entity keyed by the type id — and
 * compares observed failures against the exemption ledger with exact equality,
 * mirroring the core-tier suite in
 * `@agentxm/client-core` extension-types/parity.
 */

import * as fs from "node:fs";
import * as Effect from "effect/Effect";

import { getEntityView } from "@agentxm/client-core/unstable/cli-renderer";
import type { SubjectType } from "@agentxm/client-core/unstable/cli-runtime";
import {
  CATALOG_EXTENSION_TYPES,
  EXTENSION_LIFECYCLE_CONTRACT,
  exemptedObligations,
  obligationsVerifiedBy,
  type CatalogExtensionType,
  type ObligationId,
} from "@agentxm/client-core/unstable/extension-types";
import { extensionTypes, toExtensionTypePlural } from "@agentxm/client-core/unstable/extensions";
import * as EffectRecord from "effect/Record";
import { describe, expect, it } from "vitest";

import { HELP_TOPIC_NAMES } from "./__generated__/help-topics.js";
import { collectHelpFiles, type HelpFiles } from "./command-tree-test-helpers.js";
// Loading the command tree registers every renderer entity as a module side
// effect; without this import the 8.6 check would observe an empty registry.
import "./app.js";

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
 * obligation. Adding a cli-tier obligation without a checker here fails the
 * coverage test below.
 */
const CHECKS: Record<
  ObligationId,
  ((files: HelpFiles, type: CatalogExtensionType) => boolean) | null
> = {
  "2.6-accepted-resolution": null,
  "2.9-read-model-family": null,
  "2.11-ownership-safe-prune": null,
  "2.12-workspace-reconciliation": null,
  "2.13-transactional-postcondition": null,
  "6.1-e2e-install-row": null,
  "6.2-lifecycle-postconditions": null,
  "6.3-preview-apply-equivalence": null,
  "6.4-idempotent-validity": null,
  "6.5-scope-isolation": null,
  "6.6-pack-reachability": null,
  "7.1-help-topic": (_files, type) => topicNames.has(toExtensionTypePlural(type)),
  "8.6-entity-key": (_files, type) => getEntityView(type) !== undefined,
  "8.7-lifecycle-verbs": hasLifecycleVerbs,
  "8.8-lifecycle-flags": hasLifecycleFlags,
  "8.9-scope-surface": hasScopeSurface,
};

const cliObligations = obligationsVerifiedBy(TIER);

const observedFailures = (
  files: HelpFiles,
): Record<CatalogExtensionType, ReadonlyArray<ObligationId>> =>
  EffectRecord.fromEntries(
    CATALOG_EXTENSION_TYPES.map((type) => [
      type,
      cliObligations.filter((id) => {
        const check = CHECKS[id];
        return check !== null && !check(files, type);
      }),
    ]),
  );

// Type-level pin, both directions. `SubjectType` labels what a command acted
// on in telemetry and JSON output, so it must name every catalog type plus
// packs — and nothing else. A one-directional check would let a member linger
// after its type was renamed or removed. `mixed` and `unknown` are aggregate
// markers rather than types, so they are excluded before comparing.
type ExtensionSubjectType = Exclude<SubjectType, "mixed" | "unknown">;
type _SubjectTypeMatchesCatalog =
  Exclude<CatalogExtensionType | "pack", ExtensionSubjectType> extends never
    ? Exclude<ExtensionSubjectType, CatalogExtensionType | "pack"> extends never
      ? true
      : false
    : false;
const _subjectTypeMatchesCatalog = true as const satisfies _SubjectTypeMatchesCatalog;
export type _SubjectTypeCoverage = typeof _subjectTypeMatchesCatalog;

describe("extension type parity (cli tier)", () => {
  it("has a checker for every obligation this tier verifies", () => {
    expect(cliObligations.filter((id) => CHECKS[id] === null)).toStrictEqual([]);
  });

  it("matches the exemption ledger exactly", async () => {
    const files = await Effect.runPromise(collectHelpFiles());
    expect(observedFailures(files)).toStrictEqual(exemptedObligations(TIER));
  });

  it("registers lifecycle verbs for every extension type, including containers", async () => {
    const files = await Effect.runPromise(collectHelpFiles());
    expect(
      extensionTypes.filter((type) =>
        EXTENSION_LIFECYCLE_CONTRACT[type].mutations.some(
          (verb) => files.get(`axm ${toExtensionTypePlural(type)} ${verb}`) === undefined,
        ),
      ),
    ).toStrictEqual([]);
  });

  it("names no extension type in its own source", () => {
    // A hand-written type name here would let this suite keep passing while
    // silently skipping a type the catalog added. The forbidden set is built
    // at runtime, so this file never has to spell one out.
    const forbidden = new Set<string>(CATALOG_EXTENSION_TYPES);
    const source = fs.readFileSync(import.meta.filename, "utf-8");

    const offenders = Array.from(source.matchAll(/["'`]([^"'`\n]*)["'`]/g))
      .filter(([, literal = ""]) => forbidden.has(literal))
      .map(([match]) => match);

    expect(offenders).toStrictEqual([]);
  });
});

/**
 * Per-change specification verdict.
 *
 * Renders the requirement diff for one proposed change in product language —
 * added, changed, and removed requirement identities — together with the
 * evidence status of every affected requirement. Missing or stale evidence is
 * shown, never rolled up as a pass.
 */

import * as crypto from "node:crypto";

import type { CatalogSpecification } from "./specification-catalog-lib.js";

export interface VerdictSource {
  readonly specification: CatalogSpecification;
  /** Hash of the complete specification source, not only its metadata. */
  readonly contentDigest: string;
}

export type EvidenceStatus = "passed" | "failed" | "skipped" | "missing";

export interface AffectedRequirement {
  readonly requirement: string;
  readonly title: string;
  readonly requirementClass: string;
  readonly change: "added" | "removed" | "revised-contract" | "revised-evidence";
  readonly evidence: EvidenceStatus;
}

export interface Verdict {
  readonly affected: readonly AffectedRequirement[];
  readonly unchangedCount: number;
}

export const digestContent = (content: string): string =>
  crypto.createHash("sha256").update(content).digest("hex");

const metadataDigest = (specification: CatalogSpecification): string =>
  digestContent(
    JSON.stringify({
      title: specification.title,
      requirementClass: specification.requirementClass,
      intents: specification.intents,
      boundary: specification.boundary,
      selection: specification.selection,
      methods: specification.methods,
      cases: specification.cases,
    }),
  );

export interface JunitFileOutcome {
  readonly failures: number;
  readonly errors: number;
  readonly skipped: number;
  readonly tests: number;
}

/** Parses per-testsuite outcomes keyed by the suite's file path attribute. */
export const parseJunitOutcomes = (junitXml: string): ReadonlyMap<string, JunitFileOutcome> => {
  const outcomes = new Map<string, JunitFileOutcome>();
  const suitePattern = /<testsuite\b([^>]*)>/g;
  const attribute = (attributes: string, name: string): string | undefined => {
    const match = new RegExp(`\\b${name}="([^"]*)"`).exec(attributes);
    return match?.[1];
  };
  for (const match of junitXml.matchAll(suitePattern)) {
    const attributes = match[1] ?? "";
    const name = attribute(attributes, "name");
    if (name === undefined) {
      continue;
    }
    const previous = outcomes.get(name) ?? { failures: 0, errors: 0, skipped: 0, tests: 0 };
    outcomes.set(name, {
      failures: previous.failures + Number(attribute(attributes, "failures") ?? "0"),
      errors: previous.errors + Number(attribute(attributes, "errors") ?? "0"),
      skipped: previous.skipped + Number(attribute(attributes, "skipped") ?? "0"),
      tests: previous.tests + Number(attribute(attributes, "tests") ?? "0"),
    });
  }
  return outcomes;
};

const evidenceForSource = (
  source: string,
  outcomes: ReadonlyMap<string, JunitFileOutcome>,
): EvidenceStatus => {
  const relativeToSuite = source.replace(/^specifications\//, "");
  const outcome =
    outcomes.get(relativeToSuite) ??
    outcomes.get(source) ??
    [...outcomes.entries()].find(([name]) => name.endsWith(relativeToSuite))?.[1];
  if (outcome === undefined || outcome.tests === 0) {
    return "missing";
  }
  if (outcome.failures > 0 || outcome.errors > 0) {
    return "failed";
  }
  if (outcome.skipped >= outcome.tests) {
    return "skipped";
  }
  return "passed";
};

export const computeVerdict = (
  baseSources: readonly VerdictSource[],
  headSources: readonly VerdictSource[],
  junitOutcomes: ReadonlyMap<string, JunitFileOutcome>,
): Verdict => {
  const base = new Map(baseSources.map((entry) => [entry.specification.requirement, entry]));
  const head = new Map(headSources.map((entry) => [entry.specification.requirement, entry]));
  const affected: AffectedRequirement[] = [];
  let unchangedCount = 0;

  for (const [requirement, headEntry] of head) {
    const baseEntry = base.get(requirement);
    const evidence = evidenceForSource(headEntry.specification.source, junitOutcomes);
    if (baseEntry === undefined) {
      affected.push({
        requirement,
        title: headEntry.specification.title,
        requirementClass: headEntry.specification.requirementClass,
        change: "added",
        evidence,
      });
      continue;
    }
    if (metadataDigest(baseEntry.specification) !== metadataDigest(headEntry.specification)) {
      affected.push({
        requirement,
        title: headEntry.specification.title,
        requirementClass: headEntry.specification.requirementClass,
        change: "revised-contract",
        evidence,
      });
      continue;
    }
    if (baseEntry.contentDigest !== headEntry.contentDigest) {
      affected.push({
        requirement,
        title: headEntry.specification.title,
        requirementClass: headEntry.specification.requirementClass,
        change: "revised-evidence",
        evidence,
      });
      continue;
    }
    unchangedCount += 1;
  }

  for (const [requirement, baseEntry] of base) {
    if (!head.has(requirement)) {
      affected.push({
        requirement,
        title: baseEntry.specification.title,
        requirementClass: baseEntry.specification.requirementClass,
        change: "removed",
        evidence: "missing",
      });
    }
  }

  affected.sort((a, b) => a.requirement.localeCompare(b.requirement));
  return { affected, unchangedCount };
};

const CHANGE_LABEL: Readonly<Record<AffectedRequirement["change"], string>> = {
  added: "Added requirement",
  removed: "Removed requirement",
  "revised-contract": "Revised requirement contract",
  "revised-evidence": "Revised specification evidence",
};

export const renderVerdictMarkdown = (verdict: Verdict): string => {
  const lines: string[] = ["## Specification verdict", ""];
  if (verdict.affected.length === 0) {
    lines.push(
      `No requirement contract changes. ${verdict.unchangedCount} requirement(s) unchanged.`,
      "",
    );
    return lines.join("\n");
  }
  lines.push(
    "This change affects the requirement contract. Review it as a requirements",
    "decision, not test maintenance.",
    "",
    "| Requirement | Change | Class | Evidence |",
    "| --- | --- | --- | --- |",
  );
  for (const entry of verdict.affected) {
    lines.push(
      `| \`${entry.requirement}\` — ${entry.title} | ${CHANGE_LABEL[entry.change]} | ${entry.requirementClass} | ${entry.evidence} |`,
    );
  }
  lines.push("", `${verdict.unchangedCount} requirement(s) unchanged.`, "");
  return lines.join("\n");
};

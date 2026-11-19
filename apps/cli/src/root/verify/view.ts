import type { ReleaseVerificationDocument } from "@agentxm/workspace-features/publishing";
import type { FailureSuggestedAction } from "@agentxm/workspace-kernel/operations";

import {
  capitalized,
  conditionDoc,
  moment,
  NO_CHANGES_MADE,
  operationResultDoc,
  tableDoc,
  titleDoc,
  type Doc,
  type DocNode,
} from "../../screen/index.js";

type Release = ReleaseVerificationDocument["releases"][number];
type Assessment = Release["presence"];
type Check = "presence" | "identity" | "archive";

const CHECKS: ReadonlyArray<Check> = ["presence", "identity", "archive"];

const SELECTED_BY: Readonly<Record<ReleaseVerificationDocument["registry"]["selectedBy"], string>> =
  {
    flag: "selected by --registry",
    "publish-result": "recorded by the publish result",
    default: "the default Registry",
  };

const EXPECTATION_SOURCE: Readonly<Record<NonNullable<Release["expectation"]>["source"], string>> =
  {
    flag: "--integrity",
    "publish-result": "the publish result",
  };

/**
 * One cell: the conclusion, and the finding that decided it. An unknown
 * conclusion names the Registry failure category that lost its evidence, so
 * rows that lost evidence to different categories stay distinct.
 */
const cell = (assessment: Assessment): string => {
  switch (assessment.conclusion) {
    case "satisfied":
      return "satisfied";
    case "attention-required":
      return `attention: ${assessment.finding ?? "required"}`;
    case "unknown":
      return assessment.failure === undefined
        ? "unknown"
        : `unknown (${assessment.failure.category})`;
    case "not-applicable":
      return "not assessed";
  }
};

const needsAttention = (release: Release): boolean =>
  CHECKS.some((check) => {
    const assessment = release[check];
    return assessment.conclusion === "attention-required" || assessment.conclusion === "unknown";
  });

const verdict = (document: ReleaseVerificationDocument): DocNode => {
  const count = document.releases.length;
  const subject = count === 1 ? "release" : `${String(count)} releases`;
  const attention = document.verdict.reasons.some((reason) => reason.code === "attention-required");
  return {
    _tag: "headline",
    verdict: true,
    tone: document.verdict.ok ? "ok" : "warn",
    text: document.verdict.ok
      ? `Verified the selected ${subject}`
      : attention
        ? `The selected ${subject} did not verify`
        : `Verification of the selected ${subject} is incomplete`,
    aside: [
      { text: `${String(document.selection.requests.length)} requested` },
      { text: `${String(document.releases.length)} distinct` },
      { text: NO_CHANGES_MADE },
    ],
  };
};

/** What a finding means, stated with the facts that decided it. */
const findingNote = (release: Release, check: Check): string | undefined => {
  const finding = release[check].finding;
  if (finding === undefined) return undefined;
  switch (finding) {
    case "extension-unavailable":
      return `${release.id}: the Registry returned no metadata for this extension; it is absent or not visible to this caller, and the Registry does not say which.`;
    case "version-missing":
      return `${release.id}: the extension is visible, but the Registry does not list version ${release.version}.`;
    case "integrity-mismatch":
      return `${release.id}: the Registry records integrity ${release.observed?.integrity ?? "unknown"}, but ${release.expectation === undefined ? "the expectation" : EXPECTATION_SOURCE[release.expectation.source]} expects ${release.expectation?.integrity ?? "unknown"}.`;
  }
};

/**
 * Why an assessment did not complete, with the Registry client's failure when
 * it has one. The fact carries no release, so releases that share it share
 * one note.
 */
interface CoverageFact {
  readonly key: string;
  readonly verb: string;
  readonly reason: string;
}

/**
 * What a release's row shows, scoped by the check a note speaks for: a note
 * may count its releases only when no other note of that check has a row
 * that looks the same in every column.
 */
const rowLabel = (release: Release, check: Check): string =>
  JSON.stringify([check, ...CHECKS.map((column) => cell(release[column]))]);

const coverageFact = (release: Release, check: Check): CoverageFact | undefined => {
  const assessment = release[check];
  const failure =
    assessment.failure === undefined
      ? ""
      : ` ${assessment.failure.category}: ${assessment.failure.message}`;
  const fact = (verb: string, reason: string): CoverageFact => ({
    key: JSON.stringify([check, verb, reason]),
    verb: `${check} ${verb}`,
    reason,
  });
  switch (assessment.coverage.state) {
    case "complete":
      return undefined;
    case "incomplete":
      return fact("not established", `${assessment.coverage.reasons.join(" ")}${failure}`);
    case "not-applicable":
      return fact("not assessed", assessment.coverage.reason);
  }
};

/**
 * Beyond this many releases a shared note counts them, and the table rows
 * identify them. When another note of the same check has a row that looks
 * the same, the rows cannot tell the notes apart, so the note names its
 * releases instead.
 */
const LISTED_RELEASES = 5;

const coverageNote = (
  fact: CoverageFact,
  ids: ReadonlyArray<string>,
  rowsDistinct: boolean,
): string => {
  if (ids.length === 1) return `${ids.join(", ")}: ${fact.verb}. ${fact.reason}`;
  const subject =
    ids.length <= LISTED_RELEASES || !rowsDistinct
      ? ids.join(", ")
      : `${String(ids.length)} releases`;
  return `${capitalized(fact.verb)} for ${subject}. ${fact.reason}`;
};

const yankNote = (release: Release): string | undefined => {
  const observed = release.observed;
  if (observed?.yanked !== true) return undefined;
  const facts = [
    observed.yankedAt === undefined ? undefined : `at ${moment(observed.yankedAt)}`,
    observed.yankCategory === undefined ? undefined : `as ${observed.yankCategory}`,
    observed.yankMessage === undefined ? undefined : `(${observed.yankMessage})`,
  ].filter((fact) => fact !== undefined);
  return `${release.id}: yanked${facts.length === 0 ? "" : ` ${facts.join(" ")}`}; a yanked version is still present.`;
};

/**
 * Every note in release order. Findings and yank facts belong to one release;
 * a coverage fact shared by several releases is stated once, where it first
 * occurs, for all of them.
 */
const notes = (releases: ReadonlyArray<Release>): ReadonlyArray<string> => {
  const entries: Array<string | CoverageFact> = [];
  const shared = new Map<string, { readonly ids: Array<string>; readonly rows: Set<string> }>();
  const factsByRow = new Map<string, Set<string>>();
  for (const release of releases) {
    for (const check of CHECKS) {
      const finding = findingNote(release, check);
      if (finding !== undefined) entries.push(finding);
      const fact = coverageFact(release, check);
      if (fact === undefined) continue;
      const row = rowLabel(release, check);
      const facts = factsByRow.get(row) ?? new Set<string>();
      factsByRow.set(row, facts.add(fact.key));
      const sharing = shared.get(fact.key);
      if (sharing === undefined) {
        shared.set(fact.key, { ids: [release.id], rows: new Set([row]) });
        entries.push(fact);
      } else {
        sharing.ids.push(release.id);
        sharing.rows.add(row);
      }
    }
    const yank = yankNote(release);
    if (yank !== undefined) entries.push(yank);
  }
  return entries.map((entry) => {
    if (typeof entry === "string") return entry;
    const sharing = shared.get(entry.key);
    const rows = [...(sharing?.rows ?? [])];
    return coverageNote(
      entry,
      sharing?.ids ?? [],
      rows.every((row) => factsByRow.get(row)?.size === 1),
    );
  });
};

/**
 * The human answer: which Registry answered, one row per distinct release,
 * what each finding means and what was not established, then whether the
 * selected releases verified.
 */
export const releaseVerificationDoc = (
  document: ReleaseVerificationDocument,
  suggestions: ReadonlyArray<FailureSuggestedAction> = [],
): Doc => {
  const explained = notes(document.releases);
  return operationResultDoc({
    title: titleDoc("Verify", {
      facts: [
        `on ${document.registry.name} (${document.registry.endpoint})`,
        SELECTED_BY[document.registry.selectedBy],
      ],
    }),
    body: [
      ...tableDoc(
        document.releases,
        [
          { header: "Release", role: "name", value: (release) => release.id },
          { header: "Presence", value: (release) => cell(release.presence) },
          { header: "Identity", value: (release) => cell(release.identity) },
          { header: "Archive", value: (release) => cell(release.archive) },
        ],
        { mark: (release) => (needsAttention(release) ? "warn" : undefined) },
      ),
    ],
    conditions:
      explained.length === 0
        ? []
        : [
            conditionDoc({
              tone: document.verdict.ok ? "info" : "warn",
              title: "What the registry reported",
              body: explained,
            }),
          ],
    verdict: [verdict(document)],
    next: suggestions,
  });
};

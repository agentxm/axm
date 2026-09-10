/** Requirement changes and execution evidence are independent review questions. */
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import type {
  CatalogExecutionBinding,
  CatalogSpecification,
  SpecificationSource,
} from "./specification-catalog-lib.js";
import {
  digestContent,
  sameEvidenceInputs,
  type EvidenceInputs,
  type EvidenceRun,
} from "./specification-evidence.js";

export type VerdictSource = SpecificationSource;

export type EvidenceStatus = "fresh" | "stale" | "missing" | "partial" | "unverified";
export interface EvidenceAssessment {
  readonly source: string;
  readonly boundary: string;
  readonly selection: string;
  readonly status: EvidenceStatus;
  readonly outcome: "passed" | "failed" | "skipped" | "not-run";
  readonly detail: string;
}

/**
 * Change kinds, in classification order. The first three and
 * `possibly-revised-rule` are reviewed as requirements decisions; `moved`
 * and `revised-evidence` change no contract; `implementation-impact` marks
 * an unchanged requirement whose evidence inputs changed.
 */
export type RequirementChange =
  | "added"
  | "removed"
  | "revised-contract"
  | "possibly-revised-rule"
  | "moved"
  | "revised-evidence"
  | "implementation-impact";

export const DISPOSITIONS = [
  "converted-to-test",
  "engineering-policy",
  "retired",
  "superseded-by",
] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

/** One explained removal: why an identity no longer states a requirement. */
export interface DispositionEntry {
  readonly requirement: string;
  readonly disposition: Disposition;
  /** The successor identity; required for `superseded-by`. */
  readonly successor?: string;
  readonly basis: string;
}

const DispositionEntrySchema = Schema.Struct({
  requirement: Schema.NonEmptyString,
  disposition: Schema.Literals(DISPOSITIONS),
  successor: Schema.optionalKey(Schema.NonEmptyString),
  basis: Schema.NonEmptyString,
}).pipe(
  Schema.check(
    Schema.makeFilter((entry: { readonly disposition: string; readonly successor?: string }) =>
      entry.disposition === "superseded-by" && entry.successor === undefined
        ? "superseded-by names its successor"
        : undefined,
    ),
  ),
);

export const DispositionLedgerSchema = Schema.Array(DispositionEntrySchema);

export const parseDispositionLedger = (
  text: string,
): { readonly ledger: readonly DispositionEntry[]; readonly issues: readonly string[] } => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ledger: [], issues: [`Disposition ledger is not JSON: ${String(error)}`] };
  }
  const decoded = Schema.decodeUnknownResult(DispositionLedgerSchema)(value);
  if (Result.isFailure(decoded)) {
    return { ledger: [], issues: [`Disposition ledger does not match its schema.`] };
  }
  return { ledger: decoded.success, issues: [] };
};

export interface RemovalExplanation {
  readonly disposition: Disposition;
  readonly successor?: string;
  readonly basis: string;
}

export interface AffectedRequirement {
  readonly requirement: string;
  readonly title: string;
  readonly change: RequirementChange;
  /** Owner and canonical path before and after, when they differ. */
  readonly movedFrom?: string;
  readonly movedTo?: string;
  /** For removals: the recorded disposition, or absent when unexplained. */
  readonly explanation?: RemovalExplanation;
  readonly evidence: readonly EvidenceAssessment[];
}
export interface Verdict {
  readonly affected: readonly AffectedRequirement[];
  /** Requirements with no change kind at all. */
  readonly unchangedCount: number;
  readonly implementationChanges: readonly string[];
  readonly evidenceIssues: readonly string[];
}
export interface VerdictEvidence {
  /** Current built-artifact input snapshot. */
  readonly inputs: EvidenceInputs;
  /** Current source-runtime input snapshot. */
  readonly sourceInputs?: EvidenceInputs;
  readonly runs: readonly EvidenceRun[];
  readonly executionBindings: readonly CatalogExecutionBinding[];
  readonly sourceDigests: ReadonlyMap<string, string>;
  readonly implementationChanges: readonly string[];
  readonly issues: readonly string[];
  /** Explained removals; a removal without an entry renders as unexplained. */
  readonly dispositions?: readonly DispositionEntry[];
}

/**
 * The requirement contract: metadata plus bound evidence. A changed gate
 * binding declares what the requirement counts as verification, so it
 * belongs to the contract, never to evidence maintenance.
 */
export const metadataDigest = (specification: CatalogSpecification): string =>
  digestContent(
    JSON.stringify({
      metadata: specification.metadata,
      boundEvidence: specification.boundEvidence,
    }),
  );

const locate = (specification: CatalogSpecification): string =>
  `${specification.owner}: ${specification.source}`;

export const assessExecutionEvidence = (
  source: string,
  contentDigest: string | undefined,
  boundary: string,
  selection: string,
  evidence: Pick<VerdictEvidence, "inputs" | "sourceInputs" | "runs">,
): EvidenceAssessment => {
  const base = { source, boundary, selection };
  const run = [...evidence.runs]
    .filter((candidate) => candidate.selection.includes(source))
    .sort((left, right) => right.finishedAt.localeCompare(left.finishedAt))[0];
  const file = run?.files.find((candidate) => candidate.source === source);
  if (run === undefined || file === undefined)
    return {
      ...base,
      status: "missing",
      outcome: "not-run",
      detail: "No execution receipt for this selected source.",
    };
  const provenance = `${run.suite} (${file.owner}); ${run.finishedAt}; revision ${run.inputs.revision}; ${run.inputs.runtimeMode} runtime; ${run.environment.node} ${run.environment.platform}/${run.environment.architecture}; ${file.passed}/${file.tests} passed`;
  if (source.endsWith(".spec.ts") && file.purpose !== "specification")
    return {
      ...base,
      status: "missing",
      outcome: "not-run",
      detail: `${provenance}; the receipt was not recorded as a specification execution (purpose ${file.purpose}), so its outcome is not specification evidence.`,
    };
  const outcome =
    file.failed > 0 || file.moduleFailed
      ? "failed"
      : file.skipped > 0
        ? "skipped"
        : file.passed > 0
          ? "passed"
          : "not-run";
  const currentInputs =
    run.inputs.runtimeMode === "source"
      ? (evidence.sourceInputs ?? evidence.inputs)
      : evidence.inputs;
  if (
    !run.inputsStable ||
    !sameEvidenceInputs(run.inputs, currentInputs) ||
    file.contentDigest !== contentDigest
  )
    return {
      ...base,
      status: "stale",
      outcome,
      detail: `${provenance}; source or selected runtime inputs differ, or changed during execution.`,
    };
  if (
    !run.complete ||
    run.unhandledErrors > 0 ||
    file.filtered ||
    file.skipped > 0 ||
    file.pending > 0
  )
    return {
      ...base,
      status: "partial",
      outcome,
      detail: `${provenance}; selected cases, skips, pending cases, interruption, or unhandled errors limit this run.`,
    };
  if (file.tests === 0 && !file.moduleFailed)
    return {
      ...base,
      status: "missing",
      outcome: "not-run",
      detail: `${provenance}; no test cases executed.`,
    };
  return { ...base, status: "fresh", outcome, detail: provenance };
};

const evidenceForRequirement = (
  entry: VerdictSource,
  context: VerdictEvidence,
): readonly EvidenceAssessment[] => {
  const { specification } = entry;
  const { metadata } = specification;
  const selection = metadata.selection ?? "per-change";
  const results: EvidenceAssessment[] = [
    assessExecutionEvidence(
      specification.source,
      entry.contentDigest,
      metadata.boundary ?? "memory",
      selection,
      context,
    ),
  ];
  if (metadata.methods.some((method) => method === "manual" || method === "review"))
    results.push({
      source: metadata.requirement,
      boundary: "human assessment",
      selection,
      status: "unverified",
      outcome: "not-run",
      detail: "Automated execution cannot establish the declared manual or review assessment.",
    });
  for (const binding of context.executionBindings.filter((candidate) =>
    candidate.requirements.includes(metadata.requirement),
  )) {
    results.push(
      assessExecutionEvidence(
        binding.source,
        context.sourceDigests.get(binding.source),
        binding.boundary,
        selection,
        context,
      ),
    );
  }
  for (const gate of specification.boundEvidence)
    results.push({
      source: gate.gate,
      boundary: "static gate",
      selection,
      status: "missing",
      outcome: "not-run",
      detail: `${gate.verifies} No input-bound gate result was supplied; declaring a binding is not execution evidence.`,
    });
  return results;
};

const classify = (
  previous: VerdictSource | undefined,
  entry: VerdictSource,
  implementationChanged: boolean,
): RequirementChange | undefined => {
  if (previous === undefined) return "added";
  if (metadataDigest(previous.specification) !== metadataDigest(entry.specification))
    return "revised-contract";
  if (previous.examplesDigest !== entry.examplesDigest) return "possibly-revised-rule";
  if (previous.bodyDigest !== entry.bodyDigest) return "revised-evidence";
  if (previous.specification.source !== entry.specification.source) return "moved";
  return implementationChanged ? "implementation-impact" : undefined;
};

const explainRemoval = (
  requirement: string,
  head: ReadonlyMap<string, VerdictSource>,
  dispositions: readonly DispositionEntry[],
): RemovalExplanation | undefined => {
  const recorded = dispositions.find((entry) => entry.requirement === requirement);
  if (recorded !== undefined) {
    return recorded.successor === undefined
      ? { disposition: recorded.disposition, basis: recorded.basis }
      : { disposition: recorded.disposition, successor: recorded.successor, basis: recorded.basis };
  }
  const successor = [...head.values()].find((entry) =>
    entry.specification.metadata.supersedes.includes(requirement),
  );
  return successor === undefined
    ? undefined
    : {
        disposition: "superseded-by",
        successor: successor.specification.metadata.requirement,
        basis: "The successor declares this identity in `supersedes`.",
      };
};

export const computeVerdict = (
  baseSources: readonly VerdictSource[],
  headSources: readonly VerdictSource[],
  context: VerdictEvidence,
): Verdict => {
  const base = new Map(
    baseSources.map((entry) => [entry.specification.metadata.requirement, entry]),
  );
  const head = new Map(
    headSources.map((entry) => [entry.specification.metadata.requirement, entry]),
  );
  const affected: AffectedRequirement[] = [];
  let unchangedCount = 0;
  for (const [requirement, entry] of head) {
    const previous = base.get(requirement);
    const change = classify(previous, entry, context.implementationChanges.length > 0);
    if (change === undefined) {
      unchangedCount += 1;
      continue;
    }
    const moved =
      previous !== undefined && previous.specification.source !== entry.specification.source
        ? { movedFrom: locate(previous.specification), movedTo: locate(entry.specification) }
        : {};
    affected.push({
      requirement,
      title: entry.specification.metadata.title,
      change,
      ...moved,
      evidence: evidenceForRequirement(entry, context),
    });
  }
  for (const [requirement, entry] of base) {
    if (head.has(requirement)) continue;
    const explanation = explainRemoval(requirement, head, context.dispositions ?? []);
    affected.push({
      requirement,
      title: entry.specification.metadata.title,
      change: "removed",
      ...(explanation === undefined ? {} : { explanation }),
      evidence: [],
    });
  }
  affected.sort((left, right) => left.requirement.localeCompare(right.requirement));
  return {
    affected,
    unchangedCount,
    implementationChanges: context.implementationChanges,
    evidenceIssues: context.issues,
  };
};

const CONTRACT_CHANGES: ReadonlySet<RequirementChange> = new Set([
  "added",
  "removed",
  "revised-contract",
  "possibly-revised-rule",
]);

const DISPOSITION_LABELS: Readonly<Record<Disposition, string>> = {
  "converted-to-test": "converted to an ordinary test",
  "engineering-policy": "retired as engineering policy",
  retired: "retired",
  "superseded-by": "superseded by",
};

const contractChangeLabel = (entry: AffectedRequirement): string => {
  switch (entry.change) {
    case "added":
      return "Added requirement";
    case "revised-contract":
      return "Revised requirement contract";
    case "possibly-revised-rule":
      return "Decisive examples changed; review as a possible requirement change";
    case "removed": {
      const explanation = entry.explanation;
      if (explanation === undefined) return "Removed requirement — unexplained removal";
      const successor = explanation.successor === undefined ? "" : ` \`${explanation.successor}\``;
      return `Removed requirement — ${DISPOSITION_LABELS[explanation.disposition]}${successor}: ${explanation.basis}`;
    }
    default:
      return entry.change;
  }
};

const cell = (value: string): string => value.replaceAll("|", "\\|").replaceAll("\n", " ");

export const renderVerdictMarkdown = (verdict: Verdict): string => {
  const lines = ["## Specification verdict", ""];
  const contractChanges = verdict.affected.filter((entry) => CONTRACT_CHANGES.has(entry.change));
  const unchanged = `${verdict.unchangedCount} requirement(s) unchanged in metadata, examples, and body.`;
  if (contractChanges.length === 0) lines.push(`No requirement contract changes. ${unchanged}`, "");
  else {
    lines.push(
      "Review the following requirement contract changes as requirements decisions. Merging accepts these contract changes.",
      "",
      "| Requirement | Contract change |",
      "| --- | --- |",
    );
    for (const entry of contractChanges)
      lines.push(
        `| \`${entry.requirement}\` — ${cell(entry.title)} | ${cell(contractChangeLabel(entry))} |`,
      );
    lines.push("", unchanged, "");
  }
  const moved = verdict.affected.filter((entry) => entry.change === "moved");
  if (moved.length > 0) {
    lines.push("Moved without change; identity and history preserved:", "");
    for (const entry of moved)
      lines.push(`- \`${entry.requirement}\`: ${entry.movedFrom} → ${entry.movedTo}`);
    lines.push("");
  }
  const evidenceChanges = verdict.affected.filter((entry) => entry.change === "revised-evidence");
  if (evidenceChanges.length > 0) {
    lines.push(
      "Binding or supporting coverage changed; decisive examples and metadata unchanged — not reviewed for meaning by tooling:",
      "",
    );
    for (const entry of evidenceChanges)
      lines.push(
        `- \`${entry.requirement}\`${entry.movedTo === undefined ? "" : ` (also moved: ${entry.movedFrom} → ${entry.movedTo})`}`,
      );
    lines.push("");
  }
  if (verdict.implementationChanges.length > 0)
    lines.push(
      `${verdict.implementationChanges.length} other repository input(s) changed. Evidence impact conservatively includes all current requirements; this is not a claim that every behavior changed.`,
      "",
    );
  for (const issue of verdict.evidenceIssues) lines.push(`Evidence warning: ${issue}`, "");
  if (verdict.affected.some((entry) => entry.evidence.length > 0)) {
    lines.push(
      "### Execution evidence",
      "",
      "Fresh means the recorded source and built runtime inputs match and the file ran as a labelled specification. Outcomes remain observations, not acceptance or completeness. Repository-wide invalidation assumes dependencies match the lockfile; recorded host context does not establish unobserved platform or external-system behavior.",
      "",
      "| Requirement | Source / boundary / selection | Evidence | Provenance and limits |",
      "| --- | --- | --- | --- |",
    );
    for (const entry of verdict.affected)
      for (const evidence of entry.evidence)
        lines.push(
          `| \`${entry.requirement}\` | ${cell(evidence.source)} / ${evidence.boundary} / ${evidence.selection} | ${evidence.status} / ${evidence.outcome} | ${cell(evidence.detail)} |`,
        );
    lines.push("");
  }
  return lines.join("\n");
};

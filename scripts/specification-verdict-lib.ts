/** Requirement changes and execution evidence are independent review questions. */
import type { CatalogExecutionBinding, CatalogSpecification } from "./specification-catalog-lib.js";
import {
  digestContent,
  sameEvidenceInputs,
  type EvidenceInputs,
  type EvidenceRun,
} from "./specification-evidence.js";

export interface VerdictSource {
  readonly specification: CatalogSpecification;
  readonly contentDigest: string;
}

export type EvidenceStatus = "fresh" | "stale" | "missing" | "partial" | "unverified";
export interface EvidenceAssessment {
  readonly source: string;
  readonly boundary: string;
  readonly selection: string;
  readonly status: EvidenceStatus;
  readonly outcome: "passed" | "failed" | "skipped" | "not-run";
  readonly detail: string;
}

export interface AffectedRequirement {
  readonly requirement: string;
  readonly title: string;
  readonly change:
    "added" | "removed" | "revised-contract" | "revised-evidence" | "implementation-impact";
  readonly evidence: readonly EvidenceAssessment[];
}
export interface Verdict {
  readonly affected: readonly AffectedRequirement[];
  readonly unchangedCount: number;
  readonly implementationChanges: readonly string[];
  readonly evidenceIssues: readonly string[];
}
export interface VerdictEvidence {
  readonly inputs: EvidenceInputs;
  readonly runs: readonly EvidenceRun[];
  readonly executionBindings: readonly CatalogExecutionBinding[];
  readonly sourceDigests: ReadonlyMap<string, string>;
  readonly implementationChanges: readonly string[];
  readonly issues: readonly string[];
}

const metadataDigest = (specification: CatalogSpecification): string =>
  digestContent(JSON.stringify(specification.metadata));

export const assessExecutionEvidence = (
  source: string,
  contentDigest: string | undefined,
  boundary: string,
  selection: string,
  evidence: Pick<VerdictEvidence, "inputs" | "runs">,
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
  const outcome =
    file.failed > 0 || file.moduleFailed
      ? "failed"
      : file.skipped > 0
        ? "skipped"
        : file.passed > 0
          ? "passed"
          : "not-run";
  const provenance = `${run.suite}; ${run.finishedAt}; revision ${run.inputs.revision}; ${run.environment.node} ${run.environment.platform}/${run.environment.architecture}; ${file.passed}/${file.tests} passed`;
  if (
    !run.inputsStable ||
    !sameEvidenceInputs(run.inputs, evidence.inputs) ||
    file.contentDigest !== contentDigest
  )
    return {
      ...base,
      status: "stale",
      outcome,
      detail: `${provenance}; source or built runtime inputs differ, or changed during execution.`,
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
    const change =
      previous === undefined
        ? "added"
        : metadataDigest(previous.specification) !== metadataDigest(entry.specification)
          ? "revised-contract"
          : previous.contentDigest !== entry.contentDigest
            ? "revised-evidence"
            : context.implementationChanges.length > 0
              ? "implementation-impact"
              : undefined;
    if (
      previous !== undefined &&
      metadataDigest(previous.specification) === metadataDigest(entry.specification)
    )
      unchangedCount += 1;
    if (change !== undefined)
      affected.push({
        requirement,
        title: entry.specification.metadata.title,
        change,
        evidence: evidenceForRequirement(entry, context),
      });
  }
  for (const [requirement, entry] of base) {
    if (!head.has(requirement))
      affected.push({
        requirement,
        title: entry.specification.metadata.title,
        change: "removed",
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

const changeLabel: Readonly<Record<AffectedRequirement["change"], string>> = {
  added: "Added requirement",
  removed: "Removed requirement",
  "revised-contract": "Revised requirement contract",
  "revised-evidence": "Revised specification evidence",
  "implementation-impact": "Unchanged contract; implementation inputs changed",
};
const cell = (value: string): string => value.replaceAll("|", "\\|").replaceAll("\n", " ");

export const renderVerdictMarkdown = (verdict: Verdict): string => {
  const lines = ["## Specification verdict", ""];
  const contractChanges = verdict.affected.filter(
    (entry) =>
      entry.change === "added" || entry.change === "removed" || entry.change === "revised-contract",
  );
  if (contractChanges.length === 0)
    lines.push(
      `No requirement contract changes. ${verdict.unchangedCount} requirement(s) unchanged.`,
      "",
    );
  else {
    lines.push(
      "Review the following requirement contract changes as requirements decisions. Merging accepts these contract changes.",
      "",
      "| Requirement | Contract change |",
      "| --- | --- |",
    );
    for (const entry of contractChanges)
      lines.push(
        `| \`${entry.requirement}\` — ${cell(entry.title)} | ${changeLabel[entry.change]} |`,
      );
    lines.push("", `${verdict.unchangedCount} requirement contract(s) unchanged.`, "");
  }
  const evidenceChanges = verdict.affected.filter((entry) => entry.change === "revised-evidence");
  if (evidenceChanges.length > 0) {
    lines.push("Specification evidence changed without changing the requirement contract:", "");
    for (const entry of evidenceChanges) lines.push(`- \`${entry.requirement}\``);
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
      "Fresh means the recorded source and built runtime inputs match. Outcomes remain observations, not acceptance or completeness. Repository-wide invalidation assumes dependencies match the lockfile; recorded host context does not establish unobserved platform or external-system behavior.",
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

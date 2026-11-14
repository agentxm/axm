import type { LocalCheckDocument } from "@agentxm/workspace-features/inspection";
import { headlineDoc, paragraphDoc, tableDoc, type Doc } from "../../screen/index.js";

export const localCheckDoc = (result: LocalCheckDocument): Doc => [
  ...headlineDoc(
    result.verdict.ok ? "ok" : "warn",
    result.verdict.ok ? "Selected checks satisfied" : "Selected checks require attention",
  ),
  ...paragraphDoc(`${result.scope.subjects.length} local subjects assessed; no changes applied.`),
  ...tableDoc(result.scope.subjects, [
    { header: "Subject", value: (row) => `${row.type}:${row.name}` },
    {
      header: "Included because",
      value: (row) =>
        row.requested
          ? "Requested"
          : row.includedBy.map((reason) => `${reason.kind}: ${reason.source}`).join("; "),
    },
  ]),
  ...tableDoc(result.assessments, [
    { header: "Check", value: (row) => row.kind },
    { header: "Coverage", value: (row) => row.coverage.state },
    { header: "Conclusion", value: (row) => row.conclusion },
  ]),
  ...result.assessments.flatMap((assessment) =>
    assessment.coverage.state === "incomplete"
      ? assessment.coverage.reasons.flatMap((reason) =>
          paragraphDoc(`${assessment.kind}: ${reason}`),
        )
      : assessment.coverage.state === "not-applicable"
        ? paragraphDoc(`${assessment.kind}: ${assessment.coverage.reason}`)
        : [],
  ),
  ...result.selection.requests
    .filter((request) => request.resolution !== "resolved")
    .flatMap((request) =>
      paragraphDoc(`${request.input}: ${request.reason ?? request.resolution}`),
    ),
  ...result.findings.flatMap((finding) =>
    paragraphDoc(`${finding.severity}: ${finding.ruleId}: ${finding.message}`),
  ),
  ...result.compatibility.flatMap((entry) => [
    ...(entry.constraint.status === "conflict"
      ? paragraphDoc(
          `${entry.type}:${entry.name}: conflicting constraints (${entry.constraint.contributors.map((contributor) => `${contributor.range} at ${contributor.location}`).join("; ")})`,
        )
      : []),
    ...(entry.observation !== undefined &&
    entry.observation.status !== "usable" &&
    entry.observation.status !== "not-applicable"
      ? paragraphDoc(`${entry.type}:${entry.name}: ${entry.observation.status}`)
      : []),
  ]),
  ...(result.checks.includes("compatibility")
    ? result.inspection.items.flatMap((item) =>
        item.agentOutcomes
          .filter((outcome) => outcome.outcome === "unsupported")
          .flatMap((outcome) =>
            paragraphDoc(`${item.identity.name} on ${outcome.agentId}: ${outcome.reason}`),
          ),
      )
    : []),
  ...(result.officialSkillCompatibility !== undefined &&
  result.officialSkillCompatibility.status !== "compatible"
    ? paragraphDoc(
        `Official AXM skill: ${result.officialSkillCompatibility.detail ?? result.officialSkillCompatibility.reasonCode ?? "incompatible"}`,
      )
    : []),
  ...result.reconciliation.flatMap((step) =>
    paragraphDoc(`${step.label}: ${step.message ?? step.readiness}`),
  ),
];

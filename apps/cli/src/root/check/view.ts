import type { LocalCheckDocument } from "@agentxm/workspace-features/inspection";
import {
  conditionDoc,
  count,
  NO_CHANGES_MADE,
  operationResultDoc,
  tableDoc,
  titleDoc,
  type CalloutNode,
  type Doc,
} from "../../screen/index.js";

/** One condition naming every line it covers, or nothing where there are none. */
const groupedCondition = (
  tone: "warn" | "error" | "info",
  title: string,
  lines: ReadonlyArray<string>,
): ReadonlyArray<CalloutNode> =>
  lines.length === 0 ? [] : [conditionDoc({ tone, title, body: lines })];

const coverageGaps = (result: LocalCheckDocument): ReadonlyArray<string> => {
  const gaps = new Map<string, Array<string>>();
  for (const assessment of result.assessments) {
    if (assessment.coverage.state !== "incomplete") continue;
    for (const reason of assessment.coverage.reasons) {
      const checks = gaps.get(reason) ?? [];
      if (!checks.includes(assessment.kind)) checks.push(assessment.kind);
      gaps.set(reason, checks);
    }
  }
  return [...gaps].map(([reason, checks]) => `${checks.join(", ")}: ${reason}`);
};

const unresolvedSelections = (result: LocalCheckDocument): ReadonlyArray<string> =>
  result.selection.requests
    .filter((request) => request.resolution !== "resolved")
    .map((request) => `${request.input}: ${request.reason ?? request.resolution}`);

const compatibilityIssues = (result: LocalCheckDocument): ReadonlyArray<string> => [
  ...result.compatibility.flatMap((entry) => [
    ...(entry.constraint.status === "conflict"
      ? [
          `${entry.type}:${entry.name} has conflicting constraints (${entry.constraint.contributors.map((contributor) => `${contributor.range} at ${contributor.location}`).join("; ")})`,
        ]
      : []),
    ...(entry.observation !== undefined &&
    entry.observation.status !== "usable" &&
    entry.observation.status !== "not-applicable"
      ? [`${entry.type}:${entry.name} is ${entry.observation.status}`]
      : []),
  ]),
  ...(result.checks.includes("compatibility")
    ? result.inspection.items.flatMap((item) =>
        item.agentOutcomes
          .filter((outcome) => outcome.outcome === "unsupported")
          .map((outcome) => `${item.identity.name} on ${outcome.agentId}: ${outcome.reason}`),
      )
    : []),
  ...(result.officialSkillCompatibility !== undefined &&
  result.officialSkillCompatibility.status !== "compatible"
    ? [
        `Official AXM skill: ${result.officialSkillCompatibility.detail ?? result.officialSkillCompatibility.reasonCode ?? "incompatible"}`,
      ]
    : []),
];

/**
 * `axm check` as a result: the subjects it assessed and how each check
 * concluded, the conditions that need attention grouped by kind, and the
 * verdict last, as every result closes.
 */
export const localCheckDoc = (result: LocalCheckDocument): Doc =>
  operationResultDoc({
    title: titleDoc("Check", {
      facts: [count(result.scope.subjects.length, "local subject")],
    }),
    body: [
      ...tableDoc(result.scope.subjects, [
        { header: "Subject", role: "name", value: (row) => `${row.type}:${row.name}` },
        {
          header: "Included because",
          value: (row) =>
            row.requested
              ? "requested"
              : row.includedBy.map((reason) => `${reason.kind}: ${reason.source}`).join("; "),
        },
      ]),
      ...tableDoc(result.assessments, [
        { header: "Check", role: "name", value: (row) => row.kind },
        { header: "Coverage", value: (row) => row.coverage.state },
        { header: "Conclusion", value: (row) => row.conclusion },
      ]),
    ],
    conditions: [
      ...result.findings.map((finding) =>
        conditionDoc({
          tone:
            finding.severity === "error"
              ? "error"
              : finding.severity === "warning"
                ? "warn"
                : "info",
          title: finding.message,
          facts: [finding.ruleId],
        }),
      ),
      ...groupedCondition("warn", "Some checks could not cover everything", coverageGaps(result)),
      ...groupedCondition("warn", "Some selections did not resolve", unresolvedSelections(result)),
      ...groupedCondition("warn", "Compatibility needs attention", compatibilityIssues(result)),
      ...groupedCondition(
        "info",
        "Sync would change the workspace",
        result.reconciliation.map((step) => `${step.label}: ${step.message ?? step.readiness}`),
      ),
    ],
    verdict: [
      {
        _tag: "headline",
        verdict: true,
        tone: result.verdict.ok ? "ok" : "warn",
        text: result.verdict.ok ? "Selected checks satisfied" : "Selected checks need attention",
        aside: [{ text: NO_CHANGES_MADE }],
      },
    ],
  });

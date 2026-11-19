import {
  type VisibilityEvaluationSchema,
  type VisibilityMutationResult,
} from "@agentxm/registry-protocol/unstable/publish";

import { conditionDoc, recordDoc, type Doc } from "../../screen/index.js";

/** How the visibility a workspace intends compares with what the Registry shows. */
const comparisonPhrase = (
  comparison: (typeof VisibilityEvaluationSchema.Type)["comparison"],
): string => {
  switch (comparison) {
    case "not-established":
      return "not established";
    case "unconfigured":
      return "no intent configured";
    case "match":
      return "matches intent";
    case "drift":
      return "differs from intent";
  }
};

/** Where an extension's visibility stands: what was intended, what is, and what needs attention. */
export const visibilityEvaluationDoc = (evaluation: typeof VisibilityEvaluationSchema.Type): Doc =>
  recordDoc({
    tone: "neutral",
    verdict: evaluation.target,
    facts: [comparisonPhrase(evaluation.comparison)],
    fields: [
      { label: "Intended", value: evaluation.intent?.value ?? "not configured" },
      { label: "Actual", value: evaluation.actual?.value ?? "not established" },
      evaluation.intent?.source === undefined
        ? undefined
        : { label: "Source", value: evaluation.intent.source },
    ],
    conditions: evaluation.findings.map((finding) =>
      conditionDoc({
        tone: finding.severity === "error" ? "error" : "warn",
        title: finding.message,
      }),
    ),
  });

/** A visibility change the Registry settled, with the revision it settled at. */
export const visibilityChangeDoc = (result: VisibilityMutationResult): Doc =>
  recordDoc({
    tone: "ok",
    verdict:
      result.result === "already-satisfied"
        ? `${result.target} is already ${result.after}`
        : `Changed ${result.target} from ${result.before} to ${result.after}`,
    fields: [{ label: "Revision", value: result.revision }],
  });

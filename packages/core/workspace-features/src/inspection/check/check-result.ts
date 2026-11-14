import type * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { captureLocalCheck } from "./local-check.js";
import { DEFAULT_CHECKS, type LocalCheckRequest } from "./check-selection.js";
import { decideCheckVerdict, type CheckAssessment } from "./check-assessment.js";
import { assessCheckOwnership } from "./ownership-assessment.js";

/** Decisions consume captured evidence only; rendering must never trigger another observation. */
export const assessCapturedCheck = (
  captured: Effect.Success<ReturnType<typeof captureLocalCheck>>,
  request: Pick<LocalCheckRequest, "checks" | "strict">,
) => {
  const subjects = captured.inspection.items.map(({ id }) => id);
  const findings =
    captured.lint !== undefined && Result.isSuccess(captured.lint)
      ? captured.lint.success.findings.map((finding, index) => ({
          id: `lint-${index + 1}`,
          ...finding,
        }))
      : [];
  const assessments = DEFAULT_CHECKS.map((kind): CheckAssessment => {
    const base = { kind, phase: "observation", subjectRefs: subjects, findingRefs: [] };
    if (!request.checks.includes(kind))
      return {
        ...base,
        coverage: { state: "not-requested" },
        conclusion: "unknown",
      };
    const reasons = captured.scope.incomplete.map(({ source, reason }) => `${source}: ${reason}`);
    for (const unresolved of captured.inspection.requests.filter(
      (item) => item.resolution !== "resolved",
    )) {
      reasons.push(`${unresolved.input}: ${unresolved.reason ?? unresolved.resolution}`);
    }
    if (kind === "ownership") {
      const ownership = assessCheckOwnership({
        inspection: captured.inspection,
        phase: "observation",
      });
      if (reasons.length === 0) return ownership;
      return {
        ...ownership,
        coverage: {
          state: "incomplete",
          reasons: [
            ...reasons,
            ...(ownership.coverage.state === "incomplete" ? ownership.coverage.reasons : []),
          ],
        },
        conclusion:
          ownership.conclusion === "attention-required" ? "attention-required" : "unknown",
      };
    }
    reasons.push(
      ...captured.inspection.observationDiagnostics
        .filter(({ code }) => code === "inspection-read-changed")
        .map(({ path, message }) => `${path ?? "Input"}: ${message}`),
    );
    if (
      reasons.length === 0 &&
      captured.scope.subjects.length === 0 &&
      captured.inspection.items.length > 0 &&
      captured.inspection.items.every((item) => item.identity.source.authority === "unmanaged")
    ) {
      return {
        ...base,
        coverage: {
          state: "not-applicable",
          reason: "Selected paths have no established AXM package or materialization owner.",
        },
        conclusion: "not-applicable",
      };
    }
    let attention = false;
    if (kind === "compatibility") {
      // The inspection owner distinguishes unsupported capability from missing
      // native output. Missing output belongs to convergence, not compatibility.
      attention = captured.inspection.items.some((item) =>
        item.agentOutcomes.some((outcome) => outcome.outcome === "unsupported"),
      );
      const official = captured.officialCompatibility;
      if (official?._tag === "unavailable") reasons.push(official.detail);
      if (official?._tag === "canonical-state")
        reasons.push(`Official AXM skill: ${official.status}`);
      if (official?._tag === "assessed" && official.compatibility.status !== "compatible")
        attention = true;
      if (captured.compatibility === undefined) reasons.push("Compatibility was not assessed");
      for (const subject of captured.scope.subjects) {
        if (
          !captured.compatibility?.some(
            (entry) => entry.type === subject.type && entry.name === subject.name,
          )
        ) {
          reasons.push(
            `Compatibility evidence was not observed for ${subject.type}:${subject.name}`,
          );
        }
      }
      for (const item of captured.compatibility ?? []) {
        if (Result.isFailure(item.constraint)) attention = true;
        if (Result.isFailure(item.observation)) {
          reasons.push(`Canonical observation failed for ${item.type}:${item.name}`);
        } else {
          const status = item.observation.success.status;
          if (status === "constraint-mismatch" || status === "wrong-origin") attention = true;
          else if (status !== "usable" && status !== "not-applicable") {
            reasons.push(`${item.type}:${item.name}: ${status}`);
          }
        }
      }
    } else if (kind === "lint") {
      if (captured.lint === undefined || Result.isFailure(captured.lint)) {
        reasons.push("Selected package lint did not finish");
      } else {
        attention = findings.some(({ severity }) => severity === "error");
        for (const subject of captured.scope.subjects) {
          if (
            captured.lint.success.inlineSubjects.some(
              (entry) => entry.type === subject.type && entry.name === subject.name,
            )
          )
            continue;
          const observed = captured.lint.success.observedPackages.find(
            (entry) => entry.type === subject.type && entry.name === subject.name,
          );
          if (observed === undefined || !observed.observed)
            reasons.push(`Package content was not observed for ${subject.type}:${subject.name}`);
        }
      }
    } else {
      if (captured.convergence === undefined || Result.isFailure(captured.convergence)) {
        reasons.push("Local reconciliation assessment did not finish");
      } else {
        reasons.push(
          ...captured.convergence.success.unassessed.map(
            ({ type, name, reason }) => `${type}:${name}: ${reason}`,
          ),
        );
        attention = captured.convergence.success.steps.length > 0;
        if (!captured.convergence.success.cleanupSafe)
          reasons.push("Desired-state evidence is incomplete for cleanup");
      }
    }
    return {
      ...base,
      findingRefs: kind === "lint" ? findings.map(({ id }) => id) : [],
      coverage: reasons.length === 0 ? { state: "complete" } : { state: "incomplete", reasons },
      conclusion: attention ? "attention-required" : reasons.length === 0 ? "satisfied" : "unknown",
    };
  });
  const verdict = decideCheckVerdict({
    requested: request.checks,
    strict: request.strict,
    assessments,
    findings,
    unresolvedRequestRefs: captured.selection.requests
      .filter((item) => item.resolution !== "resolved")
      .map(({ id }) => id),
  });
  return { assessments, findings, verdict };
};

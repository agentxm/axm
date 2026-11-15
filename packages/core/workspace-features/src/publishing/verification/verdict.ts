/**
 * Pure release verification decisions: each assessment from captured
 * evidence, and the one verdict over them. Decisions consume captured
 * evidence only; deciding never triggers another observation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type {
  ReleaseVerificationAssessment,
  ReleaseVerificationCheck,
  ReleaseVerificationRelease,
  ReleaseVerificationVerdict,
} from "./document.js";

/** A Registry client failure as the result reports it. */
export interface CapturedFailure {
  readonly category: string;
  readonly message: string;
}

/** The facts a Registry observation listed for the selected version. */
type ObservedRelease = NonNullable<ReleaseVerificationRelease["observed"]>;

/** What selection metadata said about one release. */
export type PresenceEvidence =
  | { readonly kind: "extension-unavailable" }
  | { readonly kind: "version-missing" }
  | { readonly kind: "listed"; readonly observed: ObservedRelease }
  | { readonly kind: "failed"; readonly failure: CapturedFailure };

/** What the admitted archive read produced for a listed release. */
export type ArchiveEvidence =
  { readonly kind: "read" } | { readonly kind: "failed"; readonly failure: CapturedFailure };

/** Why identity is not assessed for a release without an expectation. */
export type ExpectationAbsence = "none-supplied" | "not-prepared";

const complete = (
  conclusion: "satisfied" | "attention-required",
  finding?: ReleaseVerificationAssessment["finding"],
): ReleaseVerificationAssessment => ({
  coverage: { state: "complete" },
  conclusion,
  ...(finding === undefined ? {} : { finding }),
});

const incomplete = (reason: string, failure?: CapturedFailure): ReleaseVerificationAssessment => ({
  coverage: { state: "incomplete", reasons: [reason] },
  conclusion: "unknown",
  ...(failure === undefined ? {} : { failure }),
});

const unobservedReason = (presence: PresenceEvidence, subject: string): string => {
  switch (presence.kind) {
    case "extension-unavailable":
      return `${subject} because the Registry returned no extension metadata.`;
    case "version-missing":
      return `${subject} because the selected version is not listed.`;
    case "failed":
    case "listed":
      return `${subject} because Registry selection metadata is unavailable.`;
  }
};

/** Presence from the selection metadata observed in this invocation. */
export const assessPresence = (presence: PresenceEvidence): ReleaseVerificationAssessment => {
  switch (presence.kind) {
    case "extension-unavailable":
      return complete("attention-required", "extension-unavailable");
    case "version-missing":
      return complete("attention-required", "version-missing");
    case "listed":
      return complete("satisfied");
    case "failed":
      return incomplete("The Registry did not return selection metadata.", presence.failure);
  }
};

/** Intended identity: the recorded integrity compared exactly with the caller's expectation. */
export const assessIdentity = (
  presence: PresenceEvidence,
  expectation: { readonly integrity: string } | ExpectationAbsence,
): ReleaseVerificationAssessment => {
  if (expectation === "none-supplied")
    return {
      coverage: { state: "not-applicable", reason: "No expected integrity was supplied." },
      conclusion: "not-applicable",
    };
  if (expectation === "not-prepared")
    return {
      coverage: {
        state: "not-applicable",
        reason: "The publish result records no prepared archive.",
      },
      conclusion: "not-applicable",
    };
  if (presence.kind !== "listed")
    return incomplete(unobservedReason(presence, "No recorded integrity was observed"));
  return presence.observed.integrity === expectation.integrity
    ? complete("satisfied")
    : complete("attention-required", "integrity-mismatch");
};

/** Archive integrity: an admitted read against the recorded integrity. */
export const assessArchive = (
  presence: PresenceEvidence,
  archive: ArchiveEvidence | undefined,
): ReleaseVerificationAssessment => {
  if (presence.kind !== "listed")
    return incomplete(unobservedReason(presence, "No archive was read"));
  if (archive === undefined)
    return incomplete("No archive was read because no admitted read was attempted.");
  return archive.kind === "read"
    ? complete("satisfied")
    : incomplete(
        "No archive matching the recorded integrity was obtained through an admitted read.",
        archive.failure,
      );
};

const CHECKS: ReadonlyArray<ReleaseVerificationCheck> = ["presence", "identity", "archive"];

/**
 * An assessment is incomplete evidence when its coverage is incomplete or its
 * conclusion is unknown; a not-applicable assessment never contributes a reason.
 */
const isIncomplete = (assessment: ReleaseVerificationAssessment): boolean =>
  assessment.coverage.state === "incomplete" || assessment.conclusion === "unknown";

/** The one verification decision; renderers and completion consume this verdict. */
export const decideReleaseVerdict = (
  releases: ReadonlyArray<
    Pick<ReleaseVerificationRelease, "id" | "presence" | "identity" | "archive">
  >,
): ReleaseVerificationVerdict => {
  const reasons: Array<ReleaseVerificationVerdict["reasons"][number]> = [];
  for (const check of CHECKS) {
    const attention = [
      ...new Set(
        releases
          .filter((release) => release[check].conclusion === "attention-required")
          .map((release) => release.id),
      ),
    ];
    const incompleteRefs = [
      ...new Set(
        releases.filter((release) => isIncomplete(release[check])).map((release) => release.id),
      ),
    ];
    if (attention.length > 0) reasons.push({ check, code: "attention-required", refs: attention });
    if (incompleteRefs.length > 0)
      reasons.push({ check, code: "incomplete-assessment", refs: incompleteRefs });
  }
  return { ok: reasons.length === 0, reasons };
};

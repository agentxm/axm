import { formatDesiredIdentity } from "./desired-identity.js";
import type { DesiredConstraintContributor, DesiredStateProblem } from "./desired-state-graph.js";

/** Stable text naming every contributor to a desired constraint, shared by lint and sync. */
export const formatConstraintContributors = (
  contributors: ReadonlyArray<DesiredConstraintContributor>,
): string =>
  contributors
    .map((contributor) =>
      contributor.source === "pack"
        ? `${contributor.dependingPack ?? "unknown Pack"} range=${contributor.range} location=${contributor.location}`
        : `settings range=${contributor.range} location=${contributor.location}`,
    )
    .join(", ");

type PackManifestUnavailable = Extract<
  DesiredStateProblem,
  { readonly type: "pack-manifest-unavailable" }
>;

/** Why the document could not be observed: absent, or hidden by a named I/O failure. */
export const packManifestUnavailableText = (problem: PackManifestUnavailable): string =>
  problem.reason === "absent"
    ? "authored Pack manifest is absent"
    : `authored Pack manifest is unreadable${problem.cause === undefined ? "" : ` (${problem.cause})`}`;

type PackManifestInvalid = Extract<DesiredStateProblem, { readonly type: "pack-manifest-invalid" }>;

/** Why the document is not a Pack manifest, naming each schema violation's path but no value. */
export const packManifestInvalidText = (problem: PackManifestInvalid): string =>
  problem.reason === "malformed"
    ? "authored Pack manifest is not valid JSON"
    : `authored Pack manifest does not match the schema${
        problem.issues.length === 0
          ? ""
          : ` (${problem.issues
              .map((issue) =>
                issue.path === "" ? issue.message : `${issue.path}: ${issue.message}`,
              )
              .join("; ")})`
      }`;

/** Sanitized terminal text for one desired-state problem. */
export const desiredStateProblemText = (problem: DesiredStateProblem): string => {
  switch (problem.type) {
    case "pack-manifest-unavailable":
      return `${problem.pack}: ${packManifestUnavailableText(problem)}`;
    case "pack-manifest-invalid":
      return `${problem.pack}: ${packManifestInvalidText(problem)}`;
    case "pack-identity-mismatch":
      return `${problem.pack}: ${problem.detail}`;
    case "pack-resolution-unavailable":
      return `${problem.pack}: ${problem.detail}`;
    case "projection-collision":
      return `${problem.extensionType} ${problem.name}: competing identities ${problem.identities.map(formatDesiredIdentity).join(", ")}`;
    case "constraint-conflict":
      return `${problem.extensionType} ${problem.name}: incompatible constraints ${formatConstraintContributors(problem.contributors)}; decision=blocked; reason=no-satisfying-version`;
    case "workspace-owner-missing":
      return `${problem.extensionType} ${problem.name}: workspace owner is missing`;
    case "member-configuration-unbound":
      return `${problem.extensionType} ${problem.name}: ${problem.location} configures a Pack member no configured pack supplies`;
  }
};

/** Stable, sanitized terminal text for a desired-state problem set. */
export const desiredStateProblemsText = (problems: ReadonlyArray<DesiredStateProblem>): string =>
  problems.map(desiredStateProblemText).join("; ");

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

type PackManifestContentMismatch = Extract<
  DesiredStateProblem,
  { readonly type: "pack-manifest-content-mismatch" }
>;

/** Stable text for an accepted Pack manifest that differs from the observed one. */
export const packManifestContentMismatchText = (problem: PackManifestContentMismatch): string =>
  `accepted version=${problem.acceptedVersion} content=${problem.acceptedContentIdentity}; observed status=${problem.status}${problem.observedVersion === undefined ? "" : ` version=${problem.observedVersion} content=${problem.observedContentIdentity}`}`;

/** Sanitized terminal text for one desired-state problem. */
export const desiredStateProblemText = (problem: DesiredStateProblem): string => {
  switch (problem.type) {
    case "pack-manifest-unavailable":
      return `${problem.pack}: installed pack manifest is unavailable`;
    case "pack-manifest-invalid":
      return `${problem.pack}: installed pack manifest is invalid`;
    case "pack-identity-mismatch":
      return `${problem.pack}: ${problem.detail}`;
    case "pack-resolution-unavailable":
      return `${problem.pack}: ${problem.detail}`;
    case "pack-manifest-content-mismatch":
      return `${problem.pack}: ${packManifestContentMismatchText(problem)}`;
    case "projection-collision":
      return `${problem.extensionType} ${problem.name}: competing identities ${problem.identities.join(", ")}`;
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

import type { DesiredStateProblem } from "./desired-state-graph.js";

const constraintContributorText = (
  contributor: Extract<
    DesiredStateProblem,
    { readonly type: "constraint-conflict" }
  >["contributors"][number],
): string =>
  contributor.source === "pack"
    ? `${contributor.dependingPack ?? "unknown Pack"} range=${contributor.range} location=${contributor.location}`
    : `settings range=${contributor.range} location=${contributor.location}`;

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
      return `${problem.pack}: accepted version=${problem.acceptedVersion} content=${problem.acceptedContentIdentity}; observed status=${problem.status}${problem.observedVersion === undefined ? "" : ` version=${problem.observedVersion} content=${problem.observedContentIdentity}`}`;
    case "projection-collision":
      return `${problem.extensionType} ${problem.name}: competing identities ${problem.identities.join(", ")}`;
    case "constraint-conflict":
      return `${problem.extensionType} ${problem.name}: incompatible constraints ${problem.contributors.map(constraintContributorText).join(", ")}; decision=blocked; reason=no-satisfying-version`;
    case "workspace-owner-missing":
      return `${problem.extensionType} ${problem.name}: workspace owner is missing`;
  }
};

/** Stable, sanitized terminal text for a desired-state problem set. */
export const desiredStateProblemsText = (problems: ReadonlyArray<DesiredStateProblem>): string =>
  problems.map(desiredStateProblemText).join("; ");

import type { Job, PlannedJobStep } from "@agentxm/workspace-operations";
import type { PublishableType } from "./publishable-types.js";

/** The selection facts one publish candidate contributes to job planning. */
export interface PublishPlanCandidate {
  readonly fqn: string;
  readonly type: PublishableType;
  readonly dependencies?: Readonly<Record<string, unknown>>;
  readonly includedDependency?: true;
}

/** Creates dependency edges without expanding the user's selection. */
export const buildPublishJobs = <
  Candidate extends PublishPlanCandidate,
  Requirements = never,
  Output = never,
>(
  candidates: ReadonlyArray<Candidate>,
  candidateStep: (candidate: Candidate) => PlannedJobStep<Requirements, Output>,
): ReadonlyArray<Job<Requirements, Output>> => {
  const selectedFqns = new Set(candidates.map((candidate) => candidate.fqn));
  return [
    {
      concurrency: 4,
      executionPolicy: "best-effort",
      steps: candidates.map((candidate) => ({
        ...candidateStep(candidate),
        key: candidate.fqn,
        ...(candidate.type !== "pack"
          ? {}
          : {
              dependsOn: Object.keys(candidate.dependencies ?? {}).filter((fqn) =>
                selectedFqns.has(fqn),
              ),
            }),
      })),
    },
  ];
};

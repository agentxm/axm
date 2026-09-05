export interface CandidateWorkspace {
  readonly root: string;
  readonly checkout: string;
}

export interface ReleaseCandidate {
  readonly version: string;
  readonly tag: string;
}

export type ReleasePreparationResult = ReleaseCandidate &
  (
    | { readonly mode: "dry-run" }
    | {
        readonly mode: "prepared";
        readonly branch: string;
        readonly commit: string;
      }
  );

export interface ReleasePreparationHost {
  readonly preflightSource: (dryRun: boolean) => string;
  readonly preflightRegistry: () => void;
  readonly allocateCandidateWorkspace: () => CandidateWorkspace;
  readonly initializeCandidateWorkspace: (workspace: CandidateWorkspace, sourceSha: string) => void;
  readonly prepareCandidate: (workspace: CandidateWorkspace) => Promise<ReleaseCandidate>;
  readonly commitCandidate: (workspace: CandidateWorkspace, tag: string) => string;
  readonly assertSourceUnchanged: (sourceSha: string) => void;
  readonly pushCandidate: (workspace: CandidateWorkspace, branch: string) => void;
  readonly createPullRequest: (branch: string, tag: string) => void;
  readonly cleanupCandidateWorkspace: (workspace: CandidateWorkspace) => void;
}

const failureMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const combineFailures = (primary: unknown, cleanup: unknown): Error =>
  new Error(
    `${failureMessage(primary)}\nAdditionally, release candidate cleanup failed: ${failureMessage(cleanup)}`,
    { cause: new AggregateError([primary, cleanup]) },
  );

export const runReleasePreparation = async (
  dryRun: boolean,
  host: ReleasePreparationHost,
): Promise<ReleasePreparationResult> => {
  const sourceSha = host.preflightSource(dryRun);
  host.preflightRegistry();

  const workspace = host.allocateCandidateWorkspace();
  let result: ReleasePreparationResult | undefined;
  let primaryFailure: unknown;

  try {
    host.initializeCandidateWorkspace(workspace, sourceSha);
    const candidate = await host.prepareCandidate(workspace);

    if (dryRun) {
      result = { ...candidate, mode: "dry-run" };
    } else {
      const commit = host.commitCandidate(workspace, candidate.tag);
      host.assertSourceUnchanged(sourceSha);
      const branch = `release/${candidate.tag}`;
      host.pushCandidate(workspace, branch);
      host.createPullRequest(branch, candidate.tag);
      result = { ...candidate, mode: "prepared", branch, commit };
    }
  } catch (error) {
    primaryFailure = error;
  }

  let cleanupFailure: unknown;
  try {
    host.cleanupCandidateWorkspace(workspace);
  } catch (error) {
    cleanupFailure = error;
  }

  if (primaryFailure !== undefined && cleanupFailure !== undefined) {
    throw combineFailures(primaryFailure, cleanupFailure);
  }
  if (primaryFailure !== undefined) {
    throw primaryFailure;
  }
  if (cleanupFailure !== undefined) {
    throw cleanupFailure;
  }
  if (result === undefined) {
    throw new Error("Release preparation completed without a result.");
  }

  return result;
};

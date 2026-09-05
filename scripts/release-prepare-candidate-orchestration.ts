export interface VersionedReleaseCandidate<Context> {
  readonly version: string;
  readonly context: Context;
}

export interface ReleaseCandidateHost<Context> {
  readonly version: () => Promise<VersionedReleaseCandidate<Context>>;
  readonly changelog: (candidate: VersionedReleaseCandidate<Context>) => Promise<void>;
  readonly stampSkill: (version: string) => void;
  readonly generateSkill: () => void;
  readonly previewRegistry: () => void;
  readonly validateCohort: (version: string) => void;
}

export const runReleaseCandidatePreparation = async <Context>(
  host: ReleaseCandidateHost<Context>,
): Promise<string> => {
  const candidate = await host.version();
  await host.changelog(candidate);
  host.stampSkill(candidate.version);
  host.generateSkill();
  host.previewRegistry();
  host.validateCohort(candidate.version);
  return candidate.version;
};

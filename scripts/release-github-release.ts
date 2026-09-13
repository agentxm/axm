import { isTransientPublicationError, observePublication } from "./release-publication.js";

export type GitHubReleaseObservation = {
  readonly tagSha: string | null;
  readonly release: null | {
    readonly id: number;
    readonly targetCommitish: string;
    readonly draft: boolean;
    readonly prerelease: boolean;
    readonly url: string;
  };
};

export type GitHubReleaseHost = {
  readonly read: (signal: AbortSignal) => Promise<GitHubReleaseObservation>;
  readonly createDraft: (tagExists: boolean) => Promise<void>;
  readonly publishDraft: (releaseId: number) => Promise<void>;
};

const validateObservation = (
  observed: GitHubReleaseObservation,
  expectedSha: string,
): GitHubReleaseObservation => {
  if (observed.tagSha !== null && observed.tagSha !== expectedSha) {
    throw new Error(
      `Release tag integrity conflict: expected ${expectedSha}, observed ${observed.tagSha}.`,
    );
  }
  if (observed.release !== null && observed.release.targetCommitish !== expectedSha) {
    throw new Error(
      `GitHub Release target integrity conflict: expected ${expectedSha}, observed ${observed.release.targetCommitish}.`,
    );
  }
  if (observed.release?.draft === false && observed.tagSha === null) {
    throw new Error("Published GitHub Release exists without its release tag.");
  }
  if (observed.release?.prerelease === true) {
    throw new Error("Stable AXM releases cannot be GitHub prereleases.");
  }
  return observed;
};

const observeExactRelease = async (
  host: GitHubReleaseHost,
  expectedSha: string,
  draft: boolean,
): Promise<GitHubReleaseObservation> =>
  observePublication({
    name: `GitHub Release at ${expectedSha}`,
    read: async (signal) => validateObservation(await host.read(signal), expectedSha),
    matches: (observed) => observed.release?.draft === draft,
    conflicts: (observed) => observed.tagSha !== null && observed.tagSha !== expectedSha,
    retryError: isTransientPublicationError,
    timeoutMs: 90_000,
  });

export const ensureExactDraftRelease = async (
  host: GitHubReleaseHost,
  expectedSha: string,
): Promise<"created-draft" | "reused-draft" | "already-published"> => {
  const initial = validateObservation(await host.read(AbortSignal.timeout(30_000)), expectedSha);
  if (initial.release !== null) {
    return initial.release.draft ? "reused-draft" : "already-published";
  }

  let submissionFailure: unknown;
  try {
    await host.createDraft(initial.tagSha !== null);
  } catch (error) {
    submissionFailure = error;
  }

  try {
    await observeExactRelease(host, expectedSha, true);
    return "created-draft";
  } catch (readbackFailure) {
    if (submissionFailure !== undefined) {
      throw new AggregateError(
        [submissionFailure, readbackFailure],
        "GitHub Release creation and bounded readback failed.",
        { cause: readbackFailure },
      );
    }
    throw readbackFailure;
  }
};

export const publishExactDraftRelease = async (
  host: GitHubReleaseHost,
  expectedSha: string,
): Promise<"published" | "already-published"> => {
  const initial = validateObservation(await host.read(AbortSignal.timeout(30_000)), expectedSha);
  if (initial.release === null) throw new Error("Cannot publish a missing GitHub Release.");
  if (!initial.release.draft) return "already-published";

  let submissionFailure: unknown;
  try {
    await host.publishDraft(initial.release.id);
  } catch (error) {
    submissionFailure = error;
  }

  try {
    await observeExactRelease(host, expectedSha, false);
    return "published";
  } catch (readbackFailure) {
    if (submissionFailure !== undefined) {
      throw new AggregateError(
        [submissionFailure, readbackFailure],
        "GitHub Release publication and bounded readback failed.",
        { cause: readbackFailure },
      );
    }
    throw readbackFailure;
  }
};

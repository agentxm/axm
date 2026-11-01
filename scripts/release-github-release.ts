import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import {
  isTransientPublicationError,
  observePublication,
  PublicationUnconfirmed,
} from "./release-publication.js";

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

export type GitHubReleaseHost<E, R> = {
  readonly read: Effect.Effect<GitHubReleaseObservation, E, R>;
  readonly createDraft: (tagExists: boolean) => Effect.Effect<void, E, R>;
  readonly publishDraft: (releaseId: number) => Effect.Effect<void, E, R>;
};

class GitHubReleaseConflict extends Data.TaggedError("GitHubReleaseConflict")<{
  readonly detail: string;
}> {
  override get message(): string {
    return this.detail;
  }
}

const validateObservation = (observed: GitHubReleaseObservation, expectedSha: string) => {
  const detail =
    observed.tagSha !== null && observed.tagSha !== expectedSha
      ? `Release tag integrity conflict: expected ${expectedSha}, observed ${observed.tagSha}.`
      : observed.release !== null && observed.release.targetCommitish !== expectedSha
        ? `GitHub Release target integrity conflict: expected ${expectedSha}, observed ${observed.release.targetCommitish}.`
        : observed.release?.draft === false && observed.tagSha === null
          ? "Published GitHub Release exists without its release tag."
          : observed.release?.prerelease === true
            ? "Stable AXM releases cannot be GitHub prereleases."
            : undefined;
  return detail === undefined
    ? Effect.succeed(observed)
    : Effect.fail(new GitHubReleaseConflict({ detail }));
};

const observeExactRelease = <E, R>(
  host: GitHubReleaseHost<E, R>,
  expectedSha: string,
  draft: boolean,
) =>
  observePublication({
    name: `GitHub Release at ${expectedSha}`,
    read: host.read.pipe(Effect.flatMap((observed) => validateObservation(observed, expectedSha))),
    matches: (observed) => observed.release?.draft === draft,
    retryError: isTransientPublicationError,
    timeoutMs: 90_000,
  });

export const ensureExactDraftRelease = Effect.fn("Release.ensureExactDraftRelease")(function* <
  E,
  R,
>(host: GitHubReleaseHost<E, R>, expectedSha: string) {
  const initial = yield* host.read.pipe(
    Effect.timeout(30_000),
    Effect.flatMap((observed) => validateObservation(observed, expectedSha)),
  );
  if (initial.release !== null)
    return initial.release.draft ? ("reused-draft" as const) : ("already-published" as const);
  const submission = yield* Effect.result(host.createDraft(initial.tagSha !== null));
  yield* observeExactRelease(host, expectedSha, true).pipe(
    Effect.mapError((cause) =>
      Result.isFailure(submission)
        ? new PublicationUnconfirmed({
            publication: "GitHub Release creation",
            submissionFailure: submission.failure,
            cause,
          })
        : cause,
    ),
  );
  return "created-draft" as const;
});

export const publishExactDraftRelease = Effect.fn("Release.publishExactDraftRelease")(function* <
  E,
  R,
>(host: GitHubReleaseHost<E, R>, expectedSha: string) {
  const initial = yield* host.read.pipe(
    Effect.timeout(30_000),
    Effect.flatMap((observed) => validateObservation(observed, expectedSha)),
  );
  if (initial.release === null)
    return yield* new GitHubReleaseConflict({ detail: "Cannot publish a missing GitHub Release." });
  if (!initial.release.draft) return "already-published" as const;
  const submission = yield* Effect.result(host.publishDraft(initial.release.id));
  yield* observeExactRelease(host, expectedSha, false).pipe(
    Effect.mapError((cause) =>
      Result.isFailure(submission)
        ? new PublicationUnconfirmed({
            publication: "GitHub Release publication",
            submissionFailure: submission.failure,
            cause,
          })
        : cause,
    ),
  );
  return "published" as const;
});

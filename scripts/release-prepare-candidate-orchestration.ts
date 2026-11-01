import * as Effect from "effect/Effect";

interface VersionedReleaseCandidate<Context> {
  readonly version: string;
  readonly context: Context;
}

export interface ReleaseCandidateHost<Context, E = never, R = never> {
  readonly version: () => Effect.Effect<VersionedReleaseCandidate<Context>, E, R>;
  readonly changelog: (candidate: VersionedReleaseCandidate<Context>) => Effect.Effect<void, E, R>;
  readonly stampSkill: (version: string) => Effect.Effect<void, E, R>;
  readonly generateSkill: () => Effect.Effect<void, E, R>;
  readonly generateCliReference: () => Effect.Effect<void, E, R>;
  readonly validateCohort: (version: string) => Effect.Effect<void, E, R>;
}

export const runReleaseCandidatePreparation = Effect.fnUntraced(function* <Context, E, R>(
  host: ReleaseCandidateHost<Context, E, R>,
) {
  const candidate = yield* host.version();
  yield* host.changelog(candidate);
  yield* host.stampSkill(candidate.version);
  yield* host.generateSkill();
  yield* host.generateCliReference();
  yield* host.validateCohort(candidate.version);
  return candidate.version;
});

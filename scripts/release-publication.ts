import { createHash } from "node:crypto";
import * as Clock from "effect/Clock";
import * as Cause from "effect/Cause";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Random from "effect/Random";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Schedule from "effect/Schedule";
import * as HttpClientError from "effect/http/HttpClientError";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as semver from "semver";
import { requireStableVersion } from "./release-identity.js";

export class SupersededRelease extends Error {
  readonly _tag = "SupersededRelease";
  constructor(
    readonly candidate: string,
    readonly observed: string,
    readonly owner: string,
  ) {
    super(`Superseded candidate ${candidate}: ${owner} already exposes ${observed}.`);
  }
}

export class ReleaseBoundaryFailed extends Data.TaggedError("ReleaseBoundaryFailed")<{
  readonly cause: unknown;
}> {
  override get message(): string {
    return this.cause instanceof Error ? this.cause.message : "Release boundary failed.";
  }
}

/** Classify validation and foreign-boundary failures while preserving supersession. */
export const releaseBoundaryError = (cause: unknown): SupersededRelease | ReleaseBoundaryFailed =>
  cause instanceof SupersededRelease ? cause : new ReleaseBoundaryFailed({ cause });

export const guardPublicationVersion = (
  candidate: string,
  observed: string | null,
  owner: string,
): void => {
  if (semver.valid(candidate) === null || semver.prerelease(candidate) !== null)
    throw new Error("Expected a stable release version.");
  if (observed === null) return;
  if (semver.valid(observed) === null) throw new Error(`${owner} returned an invalid version.`);
  if (semver.gt(observed, candidate)) throw new SupersededRelease(candidate, observed, owner);
};

export const releaseCohortTarballPath = Effect.fn("Release.releaseCohortTarballPath")(function* (
  directory: string,
  prefix: string,
  version: string,
) {
  yield* Effect.try({ try: () => requireStableVersion(version), catch: releaseBoundaryError });
  const path = yield* Path.Path;
  const expectedFilename = `${prefix}${version}.tgz`;
  if (path.basename(expectedFilename) !== expectedFilename)
    return yield* new ReleaseBoundaryFailed({
      cause: new Error("Release tarball name must be a basename."),
    });
  const fs = yield* FileSystem.FileSystem;
  const root = path.resolve(directory);
  const entries = yield* fs.readDirectoryEntries(root);
  const entry = entries.find(
    (candidate) => candidate.name === expectedFilename && candidate.type === "File",
  );
  if (entry === undefined)
    return yield* new ReleaseBoundaryFailed({
      cause: new Error(`Release tarball is missing or not a regular file: ${expectedFilename}.`),
    });
  return path.join(root, entry.name);
});

export const contentIntegrity = (bytes: Uint8Array): string =>
  `sha512-${createHash("sha512").update(bytes).digest("base64")}`;

export class PublicationHttpError extends Error {
  readonly _tag = "PublicationHttpError";
  readonly retryable: boolean;

  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.retryable = status === 429 || status >= 500;
  }
}

const retryAfterMilliseconds = (value: string | null, now: number): number | undefined => {
  if (value === null) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
};

export const publicationHttpError = (
  owner: string,
  response: Pick<HttpClientResponse.HttpClientResponse, "status" | "headers">,
  now: number,
): PublicationHttpError =>
  new PublicationHttpError(
    `${owner}: HTTP ${response.status}.`,
    response.status,
    retryAfterMilliseconds(response.headers["retry-after"] ?? null, now),
  );

const isDeadlineAbort = (error: unknown): boolean =>
  error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");

export const isTransientPublicationError = (error: unknown): boolean => {
  if (error instanceof PublicationHttpError) return error.retryable;
  if (error instanceof TypeError) return true;
  if (HttpClientError.isHttpClientError(error)) return error.reason._tag === "TransportError";
  if (Cause.isTimeoutError(error)) return true;
  return isDeadlineAbort(error);
};

/** What the last completed attempt saw before the observation budget expired. */
export type PublicationObservation =
  | { readonly kind: "unobserved" }
  | { readonly kind: "absent" }
  | { readonly kind: "mismatch" }
  | { readonly kind: "transient"; readonly status?: number };

const describeObservation = (observation: PublicationObservation): string =>
  observation.kind === "transient" && observation.status !== undefined
    ? `transient HTTP ${observation.status}`
    : observation.kind;

const transientObservation = (error: unknown): PublicationObservation =>
  error instanceof PublicationHttpError
    ? { kind: "transient", status: error.status }
    : { kind: "transient" };

export class PublicationReadbackTimeout extends Error {
  readonly _tag = "PublicationReadbackTimeout";
  readonly publication: string;
  readonly phase: "preflight" | "readback";
  readonly attempts: number;
  readonly elapsedMs: number;
  readonly deadlineMs: number;
  readonly lastObservation: PublicationObservation;

  constructor(input: {
    readonly publication: string;
    readonly phase: "preflight" | "readback";
    readonly attempts: number;
    readonly elapsedMs: number;
    readonly deadlineMs: number;
    readonly lastObservation: PublicationObservation;
    readonly cause?: unknown;
  }) {
    super(
      `Published content readback timed out: ${input.publication} (${input.phase}, ${input.attempts} attempts, ${input.elapsedMs}ms of ${input.deadlineMs}ms, last: ${describeObservation(input.lastObservation)}).`,
      input.cause === undefined ? {} : { cause: input.cause },
    );
    this.name = "PublicationReadbackTimeout";
    this.publication = input.publication;
    this.phase = input.phase;
    this.attempts = input.attempts;
    this.elapsedMs = input.elapsedMs;
    this.deadlineMs = input.deadlineMs;
    this.lastObservation = input.lastObservation;
  }
}

export class PublicationIntegrityConflict extends Data.TaggedError("PublicationIntegrityConflict")<{
  readonly publication: string;
}> {
  override get message(): string {
    return `Published content integrity conflict: ${this.publication}.`;
  }
}

export class PublicationUnconfirmed extends Data.TaggedError("PublicationUnconfirmed")<{
  readonly publication: string;
  readonly submissionFailure: unknown;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `Publication submission and bounded readback failed: ${this.publication}.`;
  }
}

class PublicationPending extends Data.TaggedError("PublicationPending")<{
  readonly retryAfterMs: number;
}> {}

export interface ImmutablePublicationObservation {
  /** Budget for post-write readback, starting after the cohort's last submission. */
  readonly timeoutMs?: number;
  /** Independent budget for existence reads before any write. */
  readonly preflightTimeoutMs?: number;
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
}

export const observePublication = Effect.fn("Release.observePublication")(function* <
  Value,
  E,
  R,
>(input: {
  readonly name: string;
  readonly read: Effect.Effect<Value, E, R>;
  readonly matches: (value: Value) => boolean;
  readonly conflicts?: (value: Value) => boolean;
  readonly timeoutMs?: number;
  /** Shared cohort deadline; startedAt is when that budget began. */
  readonly deadlineAt?: number;
  readonly startedAt?: number;
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly retryError?: (error: E) => boolean;
}) {
  const enteredAt = yield* Clock.currentTimeMillis;
  const startedAt = input.startedAt ?? enteredAt;
  const deadlineAt = input.deadlineAt ?? startedAt + (input.timeoutMs ?? 90_000);
  const state = yield* Ref.make<{
    readonly attempts: number;
    readonly observation: PublicationObservation;
    readonly failure?: E;
  }>({ attempts: 0, observation: { kind: "unobserved" } });
  const timeout = Effect.gen(function* () {
    const last = yield* Ref.get(state);
    const now = yield* Clock.currentTimeMillis;
    return yield* Effect.fail(
      new PublicationReadbackTimeout({
        publication: input.name,
        phase: "readback",
        attempts: last.attempts,
        elapsedMs: now - startedAt,
        deadlineMs: deadlineAt - startedAt,
        lastObservation: last.observation,
        ...(last.failure === undefined ? {} : { cause: last.failure }),
      }),
    );
  });
  if (enteredAt >= deadlineAt) return yield* timeout;

  const attempt = Effect.gen(function* () {
    if ((yield* Clock.currentTimeMillis) >= deadlineAt) return yield* timeout;
    yield* Ref.update(state, (last) => ({ ...last, attempts: last.attempts + 1 }));
    const observed = yield* Effect.result(input.read);
    if (Result.isFailure(observed)) {
      if (input.retryError?.(observed.failure) !== true)
        return yield* Effect.fail(observed.failure);
      yield* Ref.update(state, (last) => ({
        ...last,
        observation: transientObservation(observed.failure),
        failure: observed.failure,
      }));
      return yield* new PublicationPending({
        retryAfterMs:
          observed.failure instanceof PublicationHttpError
            ? (observed.failure.retryAfterMs ?? 0)
            : 0,
      });
    }
    if (input.matches(observed.success)) return observed.success;
    if (input.conflicts?.(observed.success) === true)
      return yield* new PublicationIntegrityConflict({ publication: input.name });
    yield* Ref.update(state, (last) => ({
      ...last,
      observation: {
        kind: observed.success === null ? ("absent" as const) : ("mismatch" as const),
      },
    }));
    return yield* new PublicationPending({ retryAfterMs: 0 });
  });
  const schedule = Schedule.exponential(input.initialDelayMs ?? 1_000).pipe(
    Schedule.modifyDelay(({ duration, input: failure }) =>
      Random.next.pipe(
        Effect.map((random) => {
          const bounded = Math.min(input.maxDelayMs ?? 5_000, Duration.toMillis(duration));
          const jittered = Math.round(bounded * (0.8 + random * 0.4));
          return Math.max(
            jittered,
            failure instanceof PublicationPending ? failure.retryAfterMs : 0,
          );
        }),
      ),
    ),
  );
  return yield* attempt.pipe(
    Effect.retry({ schedule, while: (error) => error instanceof PublicationPending }),
    Effect.catchIf(
      (error): error is PublicationPending => error instanceof PublicationPending,
      () => timeout,
    ),
    Effect.timeoutOrElse({ duration: deadlineAt - enteredAt, orElse: () => timeout }),
  );
});

export interface ImmutablePublication<E, R> {
  readonly name: string;
  readonly integrity: string;
  readonly read: Effect.Effect<string | null, E, R>;
  readonly publish: Effect.Effect<void, E, R>;
}

type ImmutablePublicationOutcome = {
  readonly name: string;
  readonly outcome: "reused" | "published";
};

const preflightPublications = Effect.fn("Release.preflightPublications")(function* <E, R>(
  publications: ReadonlyArray<ImmutablePublication<E, R>>,
  observation: ImmutablePublicationObservation,
  concurrency: number,
) {
  const startedAt = yield* Clock.currentTimeMillis;
  const deadlineMs = observation.preflightTimeoutMs ?? 90_000;
  const deadlineAt = startedAt + deadlineMs;
  const prepared = yield* Effect.forEach(
    publications,
    (publication) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const timeout = (attempts: number) =>
          Effect.gen(function* () {
            const finishedAt = yield* Clock.currentTimeMillis;
            return yield* Effect.fail(
              new PublicationReadbackTimeout({
                publication: publication.name,
                phase: "preflight",
                attempts,
                elapsedMs: finishedAt - startedAt,
                deadlineMs,
                lastObservation: { kind: "unobserved" },
              }),
            );
          });
        if (now >= deadlineAt) return yield* timeout(0);
        const existing = yield* publication.read.pipe(
          Effect.timeoutOrElse({ duration: deadlineAt - now, orElse: () => timeout(1) }),
        );
        return { publication, existing };
      }),
    { concurrency },
  );
  for (const { publication, existing } of prepared) {
    if (existing !== null && existing !== publication.integrity)
      return yield* new PublicationIntegrityConflict({ publication: publication.name });
  }
  return prepared;
});

/**
 * Preflight all coordinates, submit each missing immutable write once, then
 * observe together under a budget beginning after the last submission.
 */
export const publishImmutableCohort = Effect.fn("Release.publishImmutableCohort")(function* <E, R>(
  publications: ReadonlyArray<ImmutablePublication<E, R>>,
  observation: ImmutablePublicationObservation & { readonly concurrency?: number } = {},
) {
  const concurrency = observation.concurrency ?? 4;
  const prepared = yield* preflightPublications(publications, observation, concurrency);
  const outcomes: ImmutablePublicationOutcome[] = prepared
    .filter(({ publication, existing }) => existing === publication.integrity)
    .map(({ publication }) => ({ name: publication.name, outcome: "reused" }));
  const pending = yield* Effect.forEach(prepared, ({ publication, existing }) =>
    Effect.gen(function* () {
      if (existing === publication.integrity) return undefined;
      const submission = yield* Effect.result(publication.publish);
      return { publication, submission };
    }),
  );
  const startedAt = yield* Clock.currentTimeMillis;
  const deadlineAt = startedAt + (observation.timeoutMs ?? 90_000);
  const published = yield* Effect.forEach(
    pending.filter((candidate) => candidate !== undefined),
    (candidate) =>
      observePublication({
        ...observation,
        name: candidate.publication.name,
        read: candidate.publication.read,
        matches: (value) => value === candidate.publication.integrity,
        conflicts: (value) => value !== null && value !== candidate.publication.integrity,
        retryError: isTransientPublicationError,
        startedAt,
        deadlineAt,
      }).pipe(
        Effect.mapError((cause) =>
          Result.isFailure(candidate.submission)
            ? new PublicationUnconfirmed({
                publication: candidate.publication.name,
                submissionFailure: candidate.submission.failure,
                cause,
              })
            : cause,
        ),
        Effect.as({ name: candidate.publication.name, outcome: "published" } as const),
      ),
    { concurrency },
  );
  return [...outcomes, ...published];
});

/** Existence-read failures propagate; only affirmative absence permits a write. */
export const publishImmutable = Effect.fn("Release.publishImmutable")(function* <E, R>(
  input: ImmutablePublication<E, R> & { readonly observation?: ImmutablePublicationObservation },
) {
  const outcomes = yield* publishImmutableCohort([input], { concurrency: 1, ...input.observation });
  const outcome = outcomes[0];
  // A single input must produce exactly one outcome; absence is an implementation invariant.
  if (outcome === undefined)
    return yield* Effect.die(new Error(`Missing publication outcome: ${input.name}.`));
  return outcome.outcome;
});

/** Confirm each immutable dependency before publishing its consumers. */
export const publishImmutableInDependencyOrder = Effect.fn(
  "Release.publishImmutableInDependencyOrder",
)(function* <E, R>(
  publications: ReadonlyArray<ImmutablePublication<E, R>>,
  observation: ImmutablePublicationObservation = {},
) {
  const prepared = yield* preflightPublications(publications, observation, 1);
  return yield* Effect.forEach(prepared, ({ publication, existing }) =>
    existing === publication.integrity
      ? Effect.succeed({ name: publication.name, outcome: "reused" } as const)
      : publishImmutable({ ...publication, observation }).pipe(
          Effect.map((outcome) => ({ name: publication.name, outcome })),
        ),
  );
});

type PublicationBoundaryName = "artifacts" | "distribution" | "npm" | "tap";

export interface PublicationBoundary<E, R> {
  readonly name: PublicationBoundaryName;
  readonly publish: () => Effect.Effect<void, E, R>;
}
export type PublicationStates = Record<
  PublicationBoundaryName,
  "pending" | "succeeded" | "failed" | "superseded"
>;

/** Preflight all mutable owners before any publication; recheck each owner at its write boundary. */
export const distributeRelease = Effect.fn("Release.distributeRelease")(function* <
  EPreflight,
  RPreflight,
  E,
  R,
  ERecord,
  RRecord,
>(
  preflight: Effect.Effect<void, EPreflight, RPreflight>,
  boundaries: ReadonlyArray<PublicationBoundary<E, R>>,
  record: (states: PublicationStates) => Effect.Effect<void, ERecord, RRecord>,
): Effect.fn.Return<
  "distributed" | "superseded",
  EPreflight | E | ERecord,
  RPreflight | R | RRecord
> {
  const states: PublicationStates = {
    artifacts: "pending",
    distribution: "pending",
    npm: "pending",
    tap: "pending",
  };
  const settleFailure = (error: EPreflight | E) =>
    error instanceof SupersededRelease
      ? Effect.logInfo(error.message).pipe(Effect.as("superseded" as const))
      : Effect.fail(error);
  const prepared = yield* Effect.result(preflight);
  if (Result.isFailure(prepared)) {
    yield* record({ ...states });
    return yield* settleFailure(prepared.failure);
  }
  for (const boundary of boundaries) {
    const result = yield* Effect.result(boundary.publish());
    states[boundary.name] = Result.isSuccess(result)
      ? "succeeded"
      : result.failure instanceof SupersededRelease
        ? "superseded"
        : "failed";
    // Recording is an independent typed boundary; failure must not replay publication.
    yield* record({ ...states });
    if (Result.isFailure(result)) return yield* settleFailure(result.failure);
  }
  return "distributed";
});

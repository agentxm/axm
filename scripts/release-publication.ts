import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { setTimeout as sleepFor } from "node:timers/promises";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as semver from "semver";
import { requireStableVersion } from "./release-identity.js";

export class SupersededRelease extends Error {
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

/** Preserve supersession while classifying failures from foreign Promise callbacks. */
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

export const releaseCohortTarballPath = (
  directory: string,
  prefix: string,
  version: string,
): string => {
  requireStableVersion(version);
  const expectedFilename = `${prefix}${version}.tgz`;
  if (basename(expectedFilename) !== expectedFilename)
    throw new Error("Release tarball name must be a basename.");
  const root = resolve(directory);
  const entry = readdirSync(root, { withFileTypes: true }).find(
    (candidate) => candidate.name === expectedFilename && candidate.isFile(),
  );
  if (entry === undefined)
    throw new Error(`Release tarball is missing or not a regular file: ${expectedFilename}.`);
  return join(root, entry.name);
};

export const contentIntegrity = (bytes: Uint8Array): string =>
  `sha512-${createHash("sha512").update(bytes).digest("base64")}`;

export class PublicationHttpError extends Error {
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
  response: Response,
  now = Date.now(),
): PublicationHttpError =>
  new PublicationHttpError(
    `${owner}: HTTP ${response.status}.`,
    response.status,
    retryAfterMilliseconds(response.headers.get("retry-after"), now),
  );

export const isTransientPublicationError = (error: unknown): boolean => {
  if (error instanceof PublicationHttpError) return error.retryable;
  if (error instanceof TypeError) return true;
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
};

const defaultSleep = async (delayMs: number, signal: AbortSignal): Promise<void> => {
  await sleepFor(delayMs, undefined, { signal });
};

const observationSignal = (signal: AbortSignal | undefined, remainingMs: number): AbortSignal => {
  const deadline = AbortSignal.timeout(Math.max(1, Math.ceil(remainingMs)));
  return signal === undefined ? deadline : AbortSignal.any([signal, deadline]);
};

export const observePublication = async <Value>(input: {
  readonly name: string;
  readonly read: (signal: AbortSignal) => Promise<Value>;
  readonly matches: (value: Value) => boolean;
  readonly conflicts?: (value: Value) => boolean;
  readonly timeoutMs?: number;
  readonly deadlineAt?: number;
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly sleep?: (delayMs: number, signal: AbortSignal) => Promise<void>;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly retryError?: (error: unknown) => boolean;
  readonly signal?: AbortSignal;
}): Promise<Value> => {
  const now = input.now ?? Date.now;
  const sleep = input.sleep ?? defaultSleep;
  const random = input.random ?? Math.random;
  const retryError = input.retryError ?? (() => false);
  const deadlineAt = input.deadlineAt ?? now() + (input.timeoutMs ?? 90_000);
  const initialDelayMs = input.initialDelayMs ?? 1_000;
  const maxDelayMs = input.maxDelayMs ?? 5_000;
  let lastFailure: unknown;
  let attempt = 0;
  const waitForNextRead = async (delayMs: number): Promise<void> => {
    if (delayMs <= 0) return;
    try {
      await sleep(delayMs, observationSignal(input.signal, deadlineAt - now()));
    } catch (error) {
      if (input.signal?.aborted === true) input.signal.throwIfAborted();
      if (
        now() < deadlineAt ||
        !(error instanceof Error) ||
        (error.name !== "AbortError" && error.name !== "TimeoutError")
      )
        throw error;
      // A deadline can cancel the final sleep before its timer completes.
      // Report the owning readback timeout, retaining any preceding read failure.
    }
  };
  while (now() < deadlineAt) {
    attempt += 1;
    if (input.signal?.aborted === true) input.signal.throwIfAborted();
    let value: Value;
    try {
      value = await input.read(observationSignal(input.signal, deadlineAt - now()));
    } catch (error) {
      if (input.signal?.aborted === true) input.signal.throwIfAborted();
      if (!retryError(error)) throw error;
      lastFailure = error;
      if (now() >= deadlineAt) break;
      const retryAfterMs = error instanceof PublicationHttpError ? error.retryAfterMs : undefined;
      const backoff = Math.min(maxDelayMs, initialDelayMs * 2 ** Math.min(attempt - 1, 8));
      const jittered = Math.round(backoff * (0.8 + random() * 0.4));
      const delayMs = Math.min(deadlineAt - now(), Math.max(jittered, retryAfterMs ?? 0));
      await waitForNextRead(delayMs);
      continue;
    }
    if (input.matches(value)) return value;
    if (input.conflicts?.(value) === true)
      throw new Error(`Published content integrity conflict: ${input.name}.`);
    const backoff = Math.min(maxDelayMs, initialDelayMs * 2 ** Math.min(attempt - 1, 8));
    const delayMs = Math.min(deadlineAt - now(), Math.round(backoff * (0.8 + random() * 0.4)));
    await waitForNextRead(delayMs);
  }
  throw new Error(`Published content readback timed out: ${input.name}.`, {
    ...(lastFailure === undefined ? {} : { cause: lastFailure }),
  });
};

export const mapWithConcurrency = async <Input, Output>(
  values: ReadonlyArray<Input>,
  concurrency: number,
  operation: (value: Input) => Promise<Output>,
): Promise<Output[]> => {
  if (!Number.isInteger(concurrency) || concurrency < 1)
    throw new Error("Publication observation concurrency must be a positive integer.");
  const outputs: Output[] = [];
  for (let offset = 0; offset < values.length; offset += concurrency) {
    outputs.push(...(await Promise.all(values.slice(offset, offset + concurrency).map(operation))));
  }
  return outputs;
};

export interface ImmutablePublication {
  readonly name: string;
  readonly integrity: string;
  readonly read: (signal: AbortSignal) => Promise<string | null>;
  readonly publish: () => Promise<void>;
}

export type ImmutablePublicationOutcome = {
  readonly name: string;
  readonly outcome: "reused" | "published";
};

/** Preflight every coordinate, submit each missing immutable write once, then observe together. */
export const publishImmutableCohort = async (
  publications: ReadonlyArray<ImmutablePublication>,
  observation: {
    readonly concurrency?: number;
    readonly timeoutMs?: number;
    readonly initialDelayMs?: number;
    readonly maxDelayMs?: number;
    readonly sleep?: (delayMs: number, signal: AbortSignal) => Promise<void>;
    readonly now?: () => number;
    readonly random?: () => number;
    readonly signal?: AbortSignal;
  } = {},
): Promise<ImmutablePublicationOutcome[]> => {
  const concurrency = observation.concurrency ?? 4;
  const now = observation.now ?? Date.now;
  const deadlineAt = now() + (observation.timeoutMs ?? 90_000);
  const prepared = await mapWithConcurrency(publications, concurrency, async (publication) => ({
    publication,
    existing: await publication.read(observationSignal(observation.signal, deadlineAt - now())),
  }));
  for (const { publication, existing } of prepared) {
    if (existing !== null && existing !== publication.integrity)
      throw new Error(`Published content integrity conflict: ${publication.name}.`);
  }
  if (now() >= deadlineAt)
    throw new Error("Publication preflight exhausted the shared observation deadline.");

  const pending: Array<{
    readonly publication: ImmutablePublication;
    readonly submissionFailure?: unknown;
  }> = [];
  const outcomes: ImmutablePublicationOutcome[] = [];
  for (const { publication, existing } of prepared) {
    if (existing === publication.integrity) {
      outcomes.push({ name: publication.name, outcome: "reused" });
      continue;
    }
    let submissionFailure: unknown;
    try {
      await publication.publish();
    } catch (error) {
      submissionFailure = error;
    }
    pending.push({
      publication,
      ...(submissionFailure === undefined ? {} : { submissionFailure }),
    });
  }

  const published = await mapWithConcurrency(pending, concurrency, async (candidate) => {
    try {
      await observePublication({
        name: candidate.publication.name,
        read: candidate.publication.read,
        matches: (value) => value === candidate.publication.integrity,
        conflicts: (value) => value !== null && value !== candidate.publication.integrity,
        deadlineAt,
        retryError: isTransientPublicationError,
        ...observation,
      });
    } catch (readbackFailure) {
      if (candidate.submissionFailure !== undefined)
        throw new AggregateError(
          [candidate.submissionFailure, readbackFailure],
          `Publication submission and bounded readback failed: ${candidate.publication.name}.`,
          { cause: readbackFailure },
        );
      throw readbackFailure;
    }
    return { name: candidate.publication.name, outcome: "published" } as const;
  });
  return [...outcomes, ...published];
};

/** Existence-read failures propagate; only an affirmative absence permits a write. */
export const publishImmutable = async (input: {
  readonly name: string;
  readonly integrity: string;
  readonly read: (signal: AbortSignal) => Promise<string | null>;
  readonly publish: () => Promise<void>;
  readonly observation?: {
    readonly timeoutMs?: number;
    readonly initialDelayMs?: number;
    readonly maxDelayMs?: number;
    readonly sleep?: (delayMs: number, signal: AbortSignal) => Promise<void>;
    readonly now?: () => number;
    readonly random?: () => number;
    readonly signal?: AbortSignal;
  };
}): Promise<"reused" | "published"> => {
  const outcomes = await publishImmutableCohort(
    [{ name: input.name, integrity: input.integrity, read: input.read, publish: input.publish }],
    { concurrency: 1, ...input.observation },
  );
  const outcome = outcomes[0];
  if (outcome === undefined) throw new Error(`Missing publication outcome: ${input.name}.`);
  return outcome.outcome;
};

export class ImmutablePublicationFailed extends Data.TaggedError("ImmutablePublicationFailed")<{
  readonly name: string;
  readonly phase: "preflight" | "publication";
  readonly cause: unknown;
}> {
  override get message(): string {
    return `Immutable ${this.phase} failed for ${this.name}.`;
  }
}

/**
 * The caller supplies dependency-first order. Verify the complete cohort before
 * writes, then confirm each immutable dependency before publishing its consumers.
 */
export const publishImmutableInDependencyOrder = (
  publications: ReadonlyArray<ImmutablePublication>,
  observation: Omit<
    NonNullable<Parameters<typeof publishImmutable>[0]["observation"]>,
    "signal"
  > = {},
) =>
  Effect.gen(function* () {
    const prepared = yield* Effect.forEach(publications, (publication) =>
      Effect.tryPromise({
        try: (signal) => publication.read(signal),
        catch: (cause) =>
          cause instanceof SupersededRelease
            ? cause
            : new ImmutablePublicationFailed({ name: publication.name, phase: "preflight", cause }),
      }).pipe(Effect.map((existing) => ({ publication, existing }))),
    ).pipe(Effect.timeout(observation.timeoutMs ?? 90_000));
    for (const { publication, existing } of prepared) {
      if (existing !== null && existing !== publication.integrity) {
        return yield* new ImmutablePublicationFailed({
          name: publication.name,
          phase: "preflight",
          cause: new Error(`Published content integrity conflict: ${publication.name}.`),
        });
      }
    }
    return yield* Effect.forEach(prepared, ({ publication, existing }) =>
      existing === publication.integrity
        ? Effect.succeed({ name: publication.name, outcome: "reused" } as const)
        : Effect.tryPromise({
            try: (signal) =>
              publishImmutable({ ...publication, observation: { ...observation, signal } }),
            catch: (cause) =>
              cause instanceof SupersededRelease
                ? cause
                : new ImmutablePublicationFailed({
                    name: publication.name,
                    phase: "publication",
                    cause,
                  }),
          }).pipe(Effect.map((outcome) => ({ name: publication.name, outcome }))),
    );
  });

export interface PublicationBoundary {
  readonly name: "artifacts" | "npm" | "tap";
  readonly publish: () => Effect.Effect<void, unknown>;
}
export type PublicationStates = Record<
  PublicationBoundary["name"],
  "pending" | "succeeded" | "failed" | "superseded"
>;

/** Preflight all mutable owners before any publication; recheck each owner at its write boundary. */
export const distributeRelease = (
  preflight: Effect.Effect<void, unknown>,
  boundaries: ReadonlyArray<PublicationBoundary>,
  record: (states: PublicationStates) => void,
): Effect.Effect<"distributed" | "superseded", unknown> => {
  return Effect.gen(function* () {
    const states: PublicationStates = { artifacts: "pending", npm: "pending", tap: "pending" };
    let active: PublicationBoundary["name"] | undefined;
    return yield* Effect.gen(function* () {
      yield* preflight;
      for (const boundary of boundaries) {
        active = boundary.name;
        yield* boundary.publish();
        states[active] = "succeeded";
        yield* Effect.sync(() => record({ ...states }));
      }
      return "distributed" as const;
    }).pipe(
      Effect.catch((error: unknown) =>
        Effect.gen(function* () {
          if (active !== undefined)
            states[active] = error instanceof SupersededRelease ? "superseded" : "failed";
          yield* Effect.sync(() => record({ ...states }));
          if (error instanceof SupersededRelease) {
            yield* Effect.sync(() => console.log(error.message));
            return "superseded" as const;
          }
          return yield* Effect.fail(error);
        }),
      ),
    );
  });
};

const NpmMetadata = Schema.Struct({
  "dist-tags": Schema.Record(Schema.String, Schema.String),
  versions: Schema.Record(Schema.String, Schema.Unknown),
});
const PublishedVersion = Schema.Struct({ dist: Schema.Struct({ integrity: Schema.String }) });

export class NpmPackagesUninitialized extends Data.TaggedError("NpmPackagesUninitialized")<{
  readonly packages: ReadonlyArray<string>;
}> {
  override get message(): string {
    return `npm packages are not initialized: ${this.packages.join(", ")}. Complete first publication and canonical trusted-publisher setup before preparing or distributing a release.`;
  }
}

export class NpmPackageQueryFailed extends Data.TaggedError("NpmPackageQueryFailed")<{
  readonly packageName: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `Could not verify npm package initialization for ${this.packageName}.`;
  }
}

const readNpmMetadata = async (
  name: string,
  fetchImplementation: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
  signal?: AbortSignal,
): Promise<typeof NpmMetadata.Type | null> => {
  const requestSignal =
    signal === undefined
      ? AbortSignal.timeout(30_000)
      : AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
  // npm's documented GET query revalidates registry caches before a write or readback.
  // https://github.com/npm/npm-registry-fetch#caching-and-writetrue-query-strings
  const response = await fetchImplementation(
    `https://registry.npmjs.org/${encodeURIComponent(name)}?write=true`,
    {
      cache: "no-store",
      // Bun does not translate the cache option into an HTTP request directive.
      headers: { "cache-control": "no-cache" },
      signal: requestSignal,
    },
  );
  if (response.status === 404) return null;
  if (response.status !== 200)
    throw publicationHttpError(`npm existence query failed for ${name}`, response);
  return Schema.decodeUnknownSync(NpmMetadata)(await response.json());
};

/** Public existence is necessary for OIDC setup; it does not prove publisher permissions. */
export const requireInitializedNpmPackages = (
  names: ReadonlyArray<string>,
  fetchImplementation: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch> = fetch,
) =>
  Effect.gen(function* () {
    // Keep these cheap public reads sequential; no release mutation has started.
    const missing = yield* Effect.filter(names, (packageName) =>
      Effect.tryPromise({
        try: (signal) => readNpmMetadata(packageName, fetchImplementation, signal),
        catch: (cause) => new NpmPackageQueryFailed({ packageName, cause }),
      }).pipe(Effect.map((metadata) => metadata === null)),
    );
    if (missing.length > 0) return yield* new NpmPackagesUninitialized({ packages: missing });
  });

export const readNpmPublication = async (
  name: string,
  version: string,
  fetchImplementation: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch> = fetch,
  signal?: AbortSignal,
): Promise<{
  readonly packageExists: boolean;
  readonly latest: string | null;
  readonly integrity: string | null;
}> => {
  const metadata = await readNpmMetadata(name, fetchImplementation, signal);
  if (metadata === null) return { packageExists: false, latest: null, integrity: null };
  const published = metadata.versions[version];
  return {
    packageExists: true,
    latest: metadata["dist-tags"]["latest"] ?? null,
    integrity:
      published === undefined
        ? null
        : Schema.decodeUnknownSync(PublishedVersion)(published).dist.integrity,
  };
};

export const readNpmDistTag = async (
  name: string,
  tag: string,
  fetchImplementation: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch> = fetch,
  signal?: AbortSignal,
): Promise<string | null> => {
  const metadata = await readNpmMetadata(name, fetchImplementation, signal);
  return metadata?.["dist-tags"][tag] ?? null;
};

export const reconcileNpmStableTag = async (input: {
  readonly name: string;
  readonly version: string;
  readonly read: (signal: AbortSignal) => Promise<string | null>;
  readonly promote: () => Promise<void>;
  readonly observation?: {
    readonly timeoutMs?: number;
    readonly initialDelayMs?: number;
    readonly maxDelayMs?: number;
    readonly sleep?: (delayMs: number, signal: AbortSignal) => Promise<void>;
    readonly now?: () => number;
    readonly random?: () => number;
    readonly signal?: AbortSignal;
  };
}): Promise<"already-current" | "promoted"> => {
  const initial = await input.read(AbortSignal.timeout(30_000));
  guardPublicationVersion(input.version, initial, input.name);
  if (initial === input.version) return "already-current";

  let submissionFailure: unknown;
  try {
    await input.promote();
  } catch (error) {
    submissionFailure = error;
  }

  try {
    await observePublication({
      name: `npm latest ${input.name}@${input.version}`,
      read: input.read,
      matches: (latest) => latest === input.version,
      conflicts: (latest) => {
        guardPublicationVersion(input.version, latest, input.name);
        return false;
      },
      retryError: isTransientPublicationError,
      timeoutMs: 120_000,
      ...input.observation,
    });
    return "promoted";
  } catch (readbackFailure) {
    if (submissionFailure !== undefined) {
      throw new AggregateError(
        [submissionFailure, readbackFailure],
        `npm latest submission and bounded readback failed for ${input.name}.`,
        { cause: readbackFailure },
      );
    }
    throw readbackFailure;
  }
};

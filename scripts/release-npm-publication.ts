import * as Clock from "effect/Clock";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import {
  contentIntegrity,
  guardPublicationVersion,
  type ImmutablePublicationObservation,
  isTransientPublicationError,
  observePublication,
  publicationHttpError,
  PublicationIntegrityConflict,
  PublicationUnconfirmed,
  ReleaseBoundaryFailed,
  releaseBoundaryError,
} from "./release-publication.js";

const NpmMetadata = Schema.Struct({
  "dist-tags": Schema.Record(Schema.String, Schema.String),
  versions: Schema.Record(Schema.String, Schema.Unknown),
});
const PublishedVersion = Schema.Struct({ dist: Schema.Struct({ integrity: Schema.String }) });
const DownloadableVersion = Schema.Struct({
  dist: Schema.Struct({ integrity: Schema.String, tarball: Schema.String }),
});

// The registry took more than eight minutes to expose an acknowledged 0.42.0
// upload, and its tarball lagged metadata. Retain a bounded propagation window.
export const npmPropagationTimeoutMs = 15 * 60_000;

/** Download readiness is separate from existence: tarball absence never permits another write. */
export const verifyNpmDownload = Effect.fn("Release.verifyNpmDownload")(function* (
  input: { readonly name: string; readonly version: string; readonly integrity: string },
  observation: ImmutablePublicationObservation = {},
) {
  const coordinate = `${input.name}@${input.version}`;
  yield* Effect.logInfo(`Waiting for checksum-verified npm download: ${coordinate}`);
  yield* observePublication({
    ...observation,
    timeoutMs: observation.timeoutMs ?? npmPropagationTimeoutMs,
    name: `${coordinate} tarball`,
    retryError: isTransientPublicationError,
    read: Effect.gen(function* () {
      const metadata = yield* readNpmMetadata(input.name);
      const published = metadata?.versions[input.version];
      if (published === undefined) return null;
      const { dist } = yield* Schema.decodeUnknownEffect(DownloadableVersion)(published);
      if (dist.integrity !== input.integrity)
        return yield* new PublicationIntegrityConflict({ publication: `${coordinate} metadata` });
      const url = yield* Effect.try({
        try: () => new URL(dist.tarball),
        catch: (cause) => new ReleaseBoundaryFailed({ cause }),
      });
      if (url.origin !== "https://registry.npmjs.org" || url.username || url.password)
        return yield* new ReleaseBoundaryFailed({
          cause: new Error(`Unexpected npm tarball host: ${coordinate}.`),
        });
      return yield* Effect.gen(function* () {
        const response = yield* HttpClient.execute(
          HttpClientRequest.get(url.href).pipe(
            HttpClientRequest.setHeader("cache-control", "no-cache"),
          ),
        );
        if (response.status === 404) {
          yield* Effect.logInfo(`npm tarball not yet downloadable: ${coordinate}`);
          return null;
        }
        if (response.status !== 200)
          return yield* Effect.fail(
            publicationHttpError(
              `npm tarball download failed for ${coordinate}`,
              response,
              yield* Clock.currentTimeMillis,
            ),
          );
        return contentIntegrity(new Uint8Array(yield* response.arrayBuffer));
      }).pipe(Effect.timeout(30_000));
    }),
    matches: (value) => value === input.integrity,
    conflicts: (value) => value !== null && value !== input.integrity,
  });
  yield* Effect.logInfo(`Verified npm download: ${coordinate}`);
});

export class NpmPackagesUninitialized extends Data.TaggedError("NpmPackagesUninitialized")<{
  readonly packages: ReadonlyArray<string>;
}> {
  override get message(): string {
    return `npm packages are not initialized: ${this.packages.join(", ")}. Complete first publication and canonical trusted-publisher setup before preparing or distributing a release.`;
  }
}

class NpmPackageQueryFailed extends Data.TaggedError("NpmPackageQueryFailed")<{
  readonly packageName: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `Could not verify npm package initialization for ${this.packageName}.`;
  }
}

const readNpmMetadata = Effect.fn("Release.readNpmMetadata")(function* (name: string) {
  // npm's documented GET query revalidates registry caches before a write or readback.
  // https://github.com/npm/npm-registry-fetch#caching-and-writetrue-query-strings
  const request = HttpClientRequest.get(
    `https://registry.npmjs.org/${encodeURIComponent(name)}?write=true`,
  ).pipe(HttpClientRequest.setHeader("cache-control", "no-cache"));
  return yield* Effect.gen(function* () {
    const response = yield* HttpClient.execute(request);
    if (response.status === 404) return null;
    if (response.status !== 200)
      return yield* Effect.fail(
        publicationHttpError(
          `npm existence query failed for ${name}`,
          response,
          yield* Clock.currentTimeMillis,
        ),
      );
    return yield* Schema.decodeUnknownEffect(NpmMetadata)(yield* response.json);
  }).pipe(Effect.timeout(30_000));
});

/** Public existence is necessary for OIDC setup; it does not prove publisher permissions. */
export const requireInitializedNpmPackages = Effect.fn("Release.requireInitializedNpmPackages")(
  function* (names: ReadonlyArray<string>) {
    // Keep these cheap public reads sequential; no release mutation has started.
    const missing = yield* Effect.filter(names, (packageName) =>
      readNpmMetadata(packageName).pipe(
        Effect.mapError((cause) => new NpmPackageQueryFailed({ packageName, cause })),
        Effect.map((metadata) => metadata === null),
      ),
    );
    if (missing.length > 0) return yield* new NpmPackagesUninitialized({ packages: missing });
  },
);

export const readNpmPublication = Effect.fn("Release.readNpmPublication")(function* (
  name: string,
  version: string,
) {
  const metadata = yield* readNpmMetadata(name);
  if (metadata === null) return { packageExists: false, latest: null, integrity: null };
  const published = metadata.versions[version];
  const integrity =
    published === undefined
      ? null
      : (yield* Schema.decodeUnknownEffect(PublishedVersion)(published)).dist.integrity;
  return { packageExists: true, latest: metadata["dist-tags"]["latest"] ?? null, integrity };
});

export const readNpmDistTag = Effect.fn("Release.readNpmDistTag")(function* (
  name: string,
  tag: string,
) {
  const metadata = yield* readNpmMetadata(name);
  return metadata?.["dist-tags"][tag] ?? null;
});

export const reconcileNpmStableTag = Effect.fn("Release.reconcileNpmStableTag")(function* <
  E,
  R,
>(input: {
  readonly name: string;
  readonly version: string;
  readonly read: Effect.Effect<string | null, E, R>;
  readonly promote: Effect.Effect<void, E, R>;
  readonly observation?: ImmutablePublicationObservation;
}) {
  const read = input.read.pipe(
    Effect.tap((observed) =>
      Effect.try({
        try: () => guardPublicationVersion(input.version, observed, input.name),
        catch: releaseBoundaryError,
      }),
    ),
  );
  const initial = yield* read.pipe(Effect.timeout(30_000));
  if (initial === input.version) return "already-current" as const;
  const submission = yield* Effect.result(input.promote);
  yield* observePublication({
    name: `npm latest ${input.name}@${input.version}`,
    read,
    matches: (latest) => latest === input.version,
    retryError: isTransientPublicationError,
    timeoutMs: 120_000,
    ...input.observation,
  }).pipe(
    Effect.mapError((cause) =>
      Result.isFailure(submission)
        ? new PublicationUnconfirmed({
            publication: `npm latest ${input.name}`,
            submissionFailure: submission.failure,
            cause,
          })
        : cause,
    ),
  );
  return "promoted" as const;
});

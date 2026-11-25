import { describe, expect, it, vi } from "@effect/vitest";
import { readFileSync } from "node:fs";
import * as Random from "effect/Random";
import * as TestClock from "effect/testing/TestClock";
import * as HttpClient from "effect/http/HttpClient";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import {
  contentIntegrity,
  PublicationReadbackTimeout,
  ReleaseBoundaryFailed,
  SupersededRelease,
} from "./release-publication.js";
import {
  readNpmDistTag,
  readNpmPublication,
  verifyNpmDownload,
  requireInitializedNpmPackages,
  reconcileNpmStableTag,
} from "./release-npm-publication.js";

const bytes = new TextEncoder().encode("candidate");
const integrity = contentIntegrity(bytes);

const boundedObservation = (timeoutMs = 10) => ({
  timeoutMs,
  initialDelayMs: 1,
  maxDelayMs: 1,
});

/** Exercise real Effect schedules and deadlines with the test clock. */
const advance = <A, E, R>(program: Effect.Effect<A, E, R>, milliseconds = 100) =>
  Effect.gen(function* () {
    const fiber = yield* program.pipe(
      Effect.provideService(Random.Random, { nextIntUnsafe: () => 0, nextDoubleUnsafe: () => 0.5 }),
      Effect.forkChild,
    );
    yield* TestClock.adjust(milliseconds);
    return yield* Fiber.join(fiber);
  });

type Fetcher = (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>;

const withFetch = <A, E, R>(
  program: Effect.Effect<A, E, R | HttpClient.HttpClient>,
  fetcher: Fetcher,
) =>
  program.pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(
      FetchHttpClient.Fetch,
      Object.assign(fetcher, { preconnect: () => undefined }),
    ),
    Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error", cache: "no-store" }),
  );

describe("bootstrap prerelease propagation window", () => {
  // The bootstrap publisher runs on import, so its readback bounds are pinned
  // at the source: a preview must not fail a lag the stable publisher accepts.
  it("observes every post-write readback within the stable npm propagation window", () => {
    const publisher = readFileSync("scripts/publish-bootstrap-prerelease.ts", "utf8");
    const readbackBounds = [...publisher.matchAll(/\btimeoutMs: ([^,\s}]+)/g)].map(
      ([, bound]) => bound,
    );
    expect(readbackBounds).toEqual(["npmPropagationTimeoutMs", "npmPropagationTimeoutMs"]);
  });
});

describe("npm download readiness", () => {
  const input = { name: "axm.sh", version: "1.2.3", integrity };
  const tarball = "https://registry.npmjs.org/axm.sh/-/axm.sh-1.2.3.tgz";
  const metadata = (digest = integrity, url = tarball) =>
    Response.json({
      "dist-tags": { latest: "1.2.3" },
      versions: { "1.2.3": { dist: { integrity: digest, tarball: url } } },
    });

  it.effect("waits beyond visible metadata until the exact tarball can be downloaded", () =>
    Effect.gen(function* () {
      let downloads = 0;
      const fetcher: Fetcher = async (url, options) => {
        expect(options?.signal).toBeDefined();
        if (String(url) !== tarball) return metadata();
        expect(options?.redirect).toBe("error");
        expect(new Headers(options?.headers).get("cache-control")).toBe("no-cache");
        downloads += 1;
        return downloads < 3 ? new Response(null, { status: 404 }) : new Response(bytes);
      };
      yield* advance(withFetch(verifyNpmDownload(input, boundedObservation()), fetcher));
      expect(downloads).toBe(3);
    }),
  );

  it.effect(
    "fails at its deadline when metadata exists but tarball bytes never become visible",
    () =>
      Effect.gen(function* () {
        const failure = yield* advance(
          Effect.flip(
            withFetch(verifyNpmDownload(input, boundedObservation()), async (url) =>
              String(url) === tarball ? new Response(null, { status: 404 }) : metadata(),
            ),
          ),
        );
        expect(failure).toBeInstanceOf(PublicationReadbackTimeout);
      }),
  );

  it.effect.each(["metadata", "bytes"])("rejects conflicting %s without retrying", (conflict) =>
    Effect.gen(function* () {
      const fetcher = vi.fn<Fetcher>(async (url) =>
        String(url) === tarball
          ? new Response("different bytes")
          : metadata(conflict === "metadata" ? "different" : integrity),
      );
      const failure = yield* Effect.flip(
        withFetch(verifyNpmDownload(input, boundedObservation()), fetcher),
      );
      expect(failure.message).toContain("integrity conflict");
      expect(fetcher).toHaveBeenCalledTimes(conflict === "metadata" ? 1 : 2);
    }),
  );

  it.effect("retries a native HTTP transport failure", () =>
    Effect.gen(function* () {
      let downloads = 0;
      yield* advance(
        withFetch(verifyNpmDownload(input, boundedObservation()), async (url) => {
          if (String(url) !== tarball) return metadata();
          if (++downloads === 1) throw new TypeError("connection reset");
          return new Response(bytes);
        }),
      );
      expect(downloads).toBe(2);
    }),
  );

  it.effect.each([401, 403])("does not retry a tarball authorization failure: %i", (status) =>
    Effect.gen(function* () {
      const fetcher = vi.fn<Fetcher>(async (url) =>
        String(url) === tarball ? new Response(null, { status }) : metadata(),
      );
      const failure = yield* Effect.flip(
        withFetch(verifyNpmDownload(input, boundedObservation()), fetcher),
      );
      expect(failure.message).toContain(`HTTP ${status}`);
      expect(fetcher).toHaveBeenCalledTimes(2);
    }),
  );

  it.effect.each([429, 503])("retries a transient tarball failure: %i", (status) =>
    Effect.gen(function* () {
      let downloads = 0;
      yield* advance(
        withFetch(verifyNpmDownload(input, boundedObservation()), async (url) => {
          if (String(url) !== tarball) return metadata();
          return ++downloads === 1
            ? new Response(null, { status, headers: { "retry-after": "0" } })
            : new Response(bytes);
        }),
      );
      expect(downloads).toBe(2);
    }),
  );

  it.effect("rejects an unexpected tarball origin before making that request", () =>
    Effect.gen(function* () {
      const fetcher = vi.fn<Fetcher>(async () =>
        metadata(integrity, "https://example.com/archive.tgz"),
      );
      const failure = yield* Effect.flip(
        withFetch(verifyNpmDownload(input, boundedObservation()), fetcher),
      );
      expect(failure.message).toContain("Unexpected npm tarball host");
      expect(fetcher).toHaveBeenCalledOnce();
    }),
  );

  it.effect("cancels an in-flight tarball download when verification is interrupted", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const aborted = yield* Deferred.make<void>();
      const verification = yield* withFetch(verifyNpmDownload(input), (url, options) => {
        if (String(url) !== tarball) return Promise.resolve(metadata());
        return new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => {
              Deferred.doneUnsafe(aborted, Effect.void);
              reject(new DOMException("Download aborted", "AbortError"));
            },
            { once: true },
          );
          Deferred.doneUnsafe(started, Effect.void);
        });
      }).pipe(Effect.forkChild);
      yield* Deferred.await(started);
      yield* Fiber.interrupt(verification);
      yield* Deferred.await(aborted);
    }),
  );

  it.effect("bounds tarball response-body consumption by the observation deadline", () =>
    Effect.gen(function* () {
      const fetcher: Fetcher = async (url) =>
        String(url) === tarball ? new Response(new ReadableStream()) : metadata();
      const failure = yield* advance(
        Effect.flip(withFetch(verifyNpmDownload(input, { timeoutMs: 10 }), fetcher)),
        20,
      );
      expect(failure).toBeInstanceOf(PublicationReadbackTimeout);
    }),
  );
});

describe("npm publication observations", () => {
  it.effect("requests revalidation of cached metadata before accepting publication facts", () =>
    Effect.gen(function* () {
      const result = yield* withFetch(
        readNpmPublication("@agentxm/new-capability", "1.2.3"),
        async (url, init) => {
          expect(new URL(String(url)).searchParams.get("write")).toBe("true");
          expect(new Headers(init?.headers).get("cache-control")).toBe("no-cache");
          return Response.json({
            "dist-tags": { latest: "1.2.3" },
            versions: { "1.2.3": { dist: { integrity } } },
          });
        },
      );
      expect(result).toEqual({ packageExists: true, latest: "1.2.3", integrity });
    }),
  );

  it.effect("distinguishes a new package from a new version of an initialized package", () =>
    Effect.gen(function* () {
      expect(
        yield* withFetch(
          readNpmPublication("@agentxm/new-capability", "1.2.3"),
          async () => new Response(null, { status: 404 }),
        ),
      ).toEqual({ packageExists: false, latest: null, integrity: null });
      expect(
        yield* withFetch(readNpmPublication("axm.sh", "1.2.3"), async () =>
          Response.json({ "dist-tags": { latest: "1.2.4" }, versions: {} }),
        ),
      ).toEqual({ packageExists: true, latest: "1.2.4", integrity: null });
    }),
  );

  it.effect.each([401, 403, 429, 503])("does not interpret HTTP %i as absence", (status) =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        withFetch(
          readNpmPublication("axm.sh", "1.2.3"),
          async () => new Response(null, { status }),
        ),
      );
      expect(failure).toMatchObject({ _tag: "PublicationHttpError", status });
    }),
  );

  it.effect("decodes the selected version and rejects an invalid published descriptor", () =>
    Effect.gen(function* () {
      const failed = yield* Effect.flip(
        withFetch(readNpmPublication("axm.sh", "1.2.3"), async () =>
          Response.json({ "dist-tags": { latest: "1.2.4" }, versions: { "1.2.3": {} } }),
        ),
      );
      expect(failed._tag).toBe("SchemaError");
      expect(
        yield* withFetch(readNpmPublication("axm.sh", "1.2.3"), async () =>
          Response.json({
            "dist-tags": { latest: "1.2.4" },
            versions: { "0.1.0": {}, "1.2.3": { dist: { integrity } } },
          }),
        ),
      ).toEqual({ packageExists: true, latest: "1.2.4", integrity });
    }),
  );

  it.effect("reads the exact dist tag and preserves package absence", () =>
    Effect.gen(function* () {
      expect(
        yield* withFetch(readNpmDistTag("axm.sh", "preview"), async () =>
          Response.json({
            "dist-tags": { latest: "1.2.4", preview: "1.3.0-preview.4" },
            versions: {},
          }),
        ),
      ).toBe("1.3.0-preview.4");
      expect(
        yield* withFetch(
          readNpmDistTag("axm.sh", "preview"),
          async () => new Response(null, { status: 404 }),
        ),
      ).toBeNull();
    }),
  );
});

describe("npm cohort initialization", () => {
  it.effect(
    "reports every missing package while accepting an initialized package without latest",
    () =>
      Effect.gen(function* () {
        const requests: string[] = [];
        const failure = yield* Effect.flip(
          withFetch(
            requireInitializedNpmPackages(["@agentxm/first", "@agentxm/ready", "@agentxm/second"]),
            async (url) => {
              requests.push(String(url));
              return new URL(String(url)).pathname.endsWith("%2Fready")
                ? Response.json({ "dist-tags": {}, versions: { "0.1.0": {} } })
                : new Response(null, { status: 404 });
            },
          ),
        );
        expect(failure).toMatchObject({
          _tag: "NpmPackagesUninitialized",
          packages: ["@agentxm/first", "@agentxm/second"],
        });
        expect(requests).toEqual(
          ["first", "ready", "second"].map(
            (name) => `https://registry.npmjs.org/%40agentxm%2F${name}?write=true`,
          ),
        );
      }),
  );

  it.effect("accepts existing packages before their next version is published", () =>
    withFetch(requireInitializedNpmPackages(["@agentxm/ready"]), async () =>
      Response.json({ "dist-tags": { latest: "0.1.0" }, versions: { "0.1.0": {} } }),
    ),
  );

  it.effect.each([401, 403, 429, 503])(
    "preserves HTTP %i as a failed query instead of claiming absence",
    (status) =>
      Effect.gen(function* () {
        const failure = yield* Effect.flip(
          withFetch(
            requireInitializedNpmPackages(["@agentxm/ready"]),
            async () => new Response(null, { status }),
          ),
        );
        expect(failure).toMatchObject({
          _tag: "NpmPackageQueryFailed",
          packageName: "@agentxm/ready",
          cause: { status },
        });
      }),
  );

  it.effect("rejects an invalid registry response", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        withFetch(
          requireInitializedNpmPackages(["@agentxm/ready"]),
          async () => new Response("{}"),
        ),
      );
      expect(failure._tag).toBe("NpmPackageQueryFailed");
    }),
  );

  it.effect("cancels the pending registry read when preparation is interrupted", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const aborted = yield* Deferred.make<void>();
      const read = yield* withFetch(
        requireInitializedNpmPackages(["@agentxm/ready"]),
        (_url, options) =>
          new Promise<Response>((_resolve, reject) => {
            options?.signal?.addEventListener(
              "abort",
              () => {
                Deferred.doneUnsafe(aborted, Effect.void);
                reject(new DOMException("Registry read aborted", "AbortError"));
              },
              { once: true },
            );
            Deferred.doneUnsafe(started, Effect.void);
          }),
      ).pipe(Effect.forkChild);
      yield* Deferred.await(started);
      yield* Fiber.interrupt(read);
      yield* Deferred.await(aborted);
    }),
  );
});

describe("npm stable tag reconciliation", () => {
  it.effect("does not write when latest already names the exact version", () =>
    Effect.gen(function* () {
      const promote = vi.fn();
      expect(
        yield* reconcileNpmStableTag({
          name: "axm.sh",
          version: "1.2.3",
          read: Effect.succeed("1.2.3"),
          promote: Effect.sync(promote),
        }),
      ).toBe("already-current");
      expect(promote).not.toHaveBeenCalled();
    }),
  );

  it.effect("repairs an older latest tag and confirms exact bounded readback", () =>
    Effect.gen(function* () {
      const observations = ["1.2.2", "1.2.2", "1.2.3"];
      const promote = vi.fn();
      expect(
        yield* advance(
          reconcileNpmStableTag({
            name: "axm.sh",
            version: "1.2.3",
            read: Effect.sync(() => observations.shift() ?? "1.2.3"),
            promote: Effect.sync(promote),
            observation: boundedObservation(),
          }),
        ),
      ).toBe("promoted");
      expect(promote).toHaveBeenCalledOnce();
    }),
  );

  it.effect("refuses to move latest backward when a newer release is visible", () =>
    Effect.gen(function* () {
      const promote = vi.fn();
      expect(
        yield* Effect.flip(
          reconcileNpmStableTag({
            name: "axm.sh",
            version: "1.2.3",
            read: Effect.succeed("1.2.4"),
            promote: Effect.sync(promote),
          }),
        ),
      ).toBeInstanceOf(SupersededRelease);
      expect(promote).not.toHaveBeenCalled();
    }),
  );

  it.effect("accepts a failed submission when readback proves the tag moved", () =>
    Effect.gen(function* () {
      const observations = ["1.2.2", "1.2.3"];
      expect(
        yield* reconcileNpmStableTag({
          name: "axm.sh",
          version: "1.2.3",
          read: Effect.sync(() => observations.shift() ?? "1.2.3"),
          promote: Effect.fail(new ReleaseBoundaryFailed({ cause: new Error("connection reset") })),
        }),
      ).toBe("promoted");
    }),
  );
});

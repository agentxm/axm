import { describe, expect, it, vi } from "@effect/vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import {
  contentIntegrity,
  observePublication,
  PublicationHttpError,
  readNpmDistTag,
  readNpmPublication,
  releaseCohortTarballPath,
  releaseBoundaryError,
  ReleaseBoundaryFailed,
  requireInitializedNpmPackages,
  reconcileNpmStableTag,
  distributeRelease,
  guardPublicationVersion,
  publishImmutable,
  publishImmutableCohort,
  publishImmutableInDependencyOrder,
  SupersededRelease,
  type PublicationStates,
} from "./release-publication.js";
import { prepareFormula } from "./release-formula.js";

const bytes = new TextEncoder().encode("candidate");
const integrity = contentIntegrity(bytes);

describe("release tarball paths", () => {
  it.each(["../outside", "1.2.3/../../outside", "1.2.3-rc.1", "1.2.3+build", "01.2.3"])(
    "rejects an invalid release version before reading release inputs: %s",
    (version) => {
      const result = spawnSync(
        "bun",
        [join("scripts", "distribute-release.ts"), version, `cli-v${version}`, "a".repeat(40)],
        { cwd: process.cwd(), encoding: "utf8" },
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        "Expected a stable release version in major.minor.patch form.",
      );
    },
  );

  it("selects only the exact regular tarball from the cohort directory", () => {
    const directory = mkdtempSync(join(tmpdir(), "axm-release-cohort-"));
    const expected = join(directory, "axm.sh-1.2.3.tgz");
    const other = join(directory, "axm.sh-1.2.30.tgz");
    try {
      writeFileSync(other, "other release");
      expect(() => releaseCohortTarballPath(directory, "axm.sh-", "1.2.3")).toThrow(
        "Release tarball is missing or not a regular file",
      );
      symlinkSync(other, expected);
      expect(() => releaseCohortTarballPath(directory, "axm.sh-", "1.2.3")).toThrow(
        "Release tarball is missing or not a regular file",
      );
      rmSync(expected);
      writeFileSync(expected, "exact release");
      expect(releaseCohortTarballPath(directory, "axm.sh-", "1.2.3")).toBe(expected);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each(["../outside", "../../outside", "/../../outside"])(
    "rejects a version that is not a stable numeric release: %s",
    (version) => {
      expect(() => releaseCohortTarballPath("release-npm", "axm.sh-", version)).toThrow(
        "Expected a stable release version in major.minor.patch form.",
      );
    },
  );

  it("rejects an invalid tarball prefix even when the version is valid", () => {
    expect(() => releaseCohortTarballPath("release-npm", "../outside/", "1.2.3")).toThrow(
      "Release tarball name must be a basename.",
    );
  });
});

const boundedObservation = (timeoutMs = 10) => {
  let current = 0;
  return {
    timeoutMs,
    initialDelayMs: 1,
    maxDelayMs: 1,
    now: () => current,
    random: () => 0.5,
    sleep: async (delayMs: number) => {
      current += delayMs;
    },
  };
};

describe("immutable release publication", () => {
  it("publishes an absent output once and verifies its readback", async () => {
    let stored: string | null = null;
    const publish = vi.fn(async () => {
      stored = integrity;
    });
    const read = async () => stored;
    await expect(publishImmutable({ name: "candidate", integrity, read, publish })).resolves.toBe(
      "published",
    );
    await expect(publishImmutable({ name: "candidate", integrity, read, publish })).resolves.toBe(
      "reused",
    );
    expect(publish).toHaveBeenCalledTimes(1);
  });
  it("rejects different content without overwriting it", async () => {
    const publish = vi.fn(async () => undefined);
    await expect(
      publishImmutable({ name: "candidate", integrity, read: async () => "different", publish }),
    ).rejects.toThrow("integrity conflict");
    expect(publish).not.toHaveBeenCalled();
  });
  it.each(["network", "authorization"])(
    "preserves %s existence failures without mutation",
    async (failure) => {
      const publish = vi.fn(async () => undefined);
      await expect(
        publishImmutable({
          name: "candidate",
          integrity,
          read: async () => {
            throw new Error(failure);
          },
          publish,
        }),
      ).rejects.toThrow(failure);
      expect(publish).not.toHaveBeenCalled();
    },
  );
  it("does not treat an unverified write as complete", async () => {
    await expect(
      publishImmutable({
        name: "candidate",
        integrity,
        read: async () => null,
        publish: async () => undefined,
        observation: boundedObservation(1),
      }),
    ).rejects.toThrow("readback timed out");
  });
  it("recovers delayed visibility after one successful write", async () => {
    let reads = 0;
    const publish = vi.fn(async () => undefined);
    await expect(
      publishImmutable({
        name: "candidate",
        integrity,
        read: async () => (++reads < 4 ? null : integrity),
        publish,
        observation: boundedObservation(),
      }),
    ).resolves.toBe("published");
    expect(publish).toHaveBeenCalledTimes(1);
  });
  it("confirms an ambiguous submission through bounded readback without resubmitting", async () => {
    let reads = 0;
    const publish = vi.fn(async () => {
      throw new Error("connection lost");
    });
    await expect(
      publishImmutable({
        name: "candidate",
        integrity,
        read: async () => (++reads < 3 ? null : integrity),
        publish,
        observation: boundedObservation(),
      }),
    ).resolves.toBe("published");
    expect(publish).toHaveBeenCalledTimes(1);
  });
  it("preflights a cohort before writing and observes missing coordinates concurrently", async () => {
    const writes: string[] = [];
    const stored = new Map<string, string>();
    const publications = ["one", "two", "three"].map((name) => ({
      name,
      integrity,
      read: async () => stored.get(name) ?? null,
      publish: async () => {
        writes.push(name);
        stored.set(name, integrity);
      },
    }));
    await expect(publishImmutableCohort(publications, { concurrency: 2 })).resolves.toEqual([
      { name: "one", outcome: "published" },
      { name: "two", outcome: "published" },
      { name: "three", outcome: "published" },
    ]);
    expect(writes).toEqual(["one", "two", "three"]);
  });
  it("rejects a cohort conflict before any write", async () => {
    const publish = vi.fn(async () => undefined);
    await expect(
      publishImmutableCohort([
        { name: "missing", integrity, read: async () => null, publish },
        { name: "conflict", integrity, read: async () => "different", publish },
      ]),
    ).rejects.toThrow("integrity conflict");
    expect(publish).not.toHaveBeenCalled();
  });
});

describe("dependency-ordered immutable publication", () => {
  it.effect("waits for dependency visibility before publishing its consumer", () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const stored = new Set<string>();
      let dependencyReads = 0;
      const publications = ["dependency", "consumer"].map((name) => ({
        name,
        integrity,
        read: async () => {
          if (!stored.has(name)) return null;
          if (name === "dependency" && ++dependencyReads < 3) return null;
          events.push(`confirmed:${name}`);
          return integrity;
        },
        publish: async () => {
          events.push(`published:${name}`);
          stored.add(name);
        },
      }));
      const result = yield* publishImmutableInDependencyOrder(publications, boundedObservation(20));
      expect(result).toEqual([
        { name: "dependency", outcome: "published" },
        { name: "consumer", outcome: "published" },
      ]);
      expect(events).toEqual([
        "published:dependency",
        "confirmed:dependency",
        "published:consumer",
        "confirmed:consumer",
      ]);
    }),
  );

  it.effect("stops before the consumer when its dependency cannot be published", () =>
    Effect.gen(function* () {
      const writes: string[] = [];
      const failure = yield* Effect.flip(
        publishImmutableInDependencyOrder(
          ["dependency", "consumer"].map((name) => ({
            name,
            integrity,
            read: async () => null,
            publish: async () => {
              writes.push(name);
              throw new Error("ENEEDAUTH");
            },
          })),
          boundedObservation(3),
        ),
      );
      expect(writes).toEqual(["dependency"]);
      expect(failure).toMatchObject({
        _tag: "ImmutablePublicationFailed",
        name: "dependency",
        phase: "publication",
      });
    }),
  );

  it.effect(
    "detects conflicting consumer bytes before publishing an earlier missing dependency",
    () =>
      Effect.gen(function* () {
        const publish = vi.fn(async () => undefined);
        const failure = yield* Effect.flip(
          publishImmutableInDependencyOrder([
            { name: "dependency", integrity, read: async () => null, publish },
            { name: "consumer", integrity, read: async () => "different", publish },
          ]),
        );
        expect(publish).not.toHaveBeenCalled();
        expect(failure).toMatchObject({
          _tag: "ImmutablePublicationFailed",
          name: "consumer",
          phase: "preflight",
        });
      }),
  );

  it.effect("reuses a confirmed write after a lost response without submitting it again", () =>
    Effect.gen(function* () {
      const stored = new Set<string>();
      const writes: string[] = [];
      yield* publishImmutableInDependencyOrder(
        ["dependency", "consumer"].map((name) => ({
          name,
          integrity,
          read: async () => (stored.has(name) ? integrity : null),
          publish: async () => {
            writes.push(name);
            stored.add(name);
            if (name === "dependency") throw new Error("response lost after publication");
          },
        })),
        boundedObservation(),
      );
      expect(writes).toEqual(["dependency", "consumer"]);
    }),
  );

  it.effect("gives each dependent publication its own observation window", () =>
    Effect.gen(function* () {
      let current = 0;
      const stored = new Set<string>();
      const results = yield* publishImmutableInDependencyOrder(
        ["dependency", "consumer"].map((name) => ({
          name,
          integrity,
          read: async () => (stored.has(name) ? integrity : null),
          publish: async () => {
            current += 2;
            stored.add(name);
          },
        })),
        { timeoutMs: 3, now: () => current },
      );
      expect(current).toBe(4);
      expect(results.every((result) => result.outcome === "published")).toBe(true);
    }),
  );

  it.effect("preserves supersession for the release orchestrator", () =>
    Effect.gen(function* () {
      const superseded = new SupersededRelease("1.0.0", "1.1.0", "npm latest");
      const publish = vi.fn(async () => undefined);
      const failure = yield* Effect.flip(
        publishImmutableInDependencyOrder([
          {
            name: "dependency",
            integrity,
            read: async () => {
              throw superseded;
            },
            publish,
          },
        ]),
      );
      expect(failure).toBe(superseded);
      expect(publish).not.toHaveBeenCalled();
    }),
  );
});

describe("bounded publication observation", () => {
  it.each(["absent", "transient failure"])(
    "reports the readback deadline when the last wait aborts after %s",
    async (outcome) => {
      let current = 0;
      const read = vi.fn(async () => {
        if (outcome === "transient failure") throw new PublicationHttpError("busy", 503);
        return null;
      });
      await expect(
        observePublication({
          name: "candidate@1.2.3",
          read,
          matches: () => false,
          retryError: (error) => error instanceof PublicationHttpError && error.retryable,
          timeoutMs: 10,
          initialDelayMs: 10,
          maxDelayMs: 10,
          random: () => 0.5,
          now: () => current,
          sleep: async (delayMs) => {
            current += delayMs;
            throw new DOMException("The operation was aborted.", "AbortError");
          },
        }),
      ).rejects.toThrow("Published content readback timed out: candidate@1.2.3.");
      expect(read).toHaveBeenCalledTimes(1);
    },
  );

  it("preserves caller cancellation during the last observation wait", async () => {
    let current = 0;
    const controller = new AbortController();
    const cancellation = new Error("release cancelled");
    await expect(
      observePublication({
        name: "candidate",
        read: async () => null,
        matches: () => false,
        timeoutMs: 10,
        now: () => current,
        signal: controller.signal,
        sleep: async (delayMs) => {
          current += delayMs;
          controller.abort(cancellation);
          throw new DOMException("The operation was aborted.", "AbortError");
        },
      }),
    ).rejects.toBe(cancellation);
  });

  it("retries explicit transient failures and honors retry-after", async () => {
    let reads = 0;
    const delays: number[] = [];
    let current = 0;
    await expect(
      observePublication({
        name: "candidate",
        read: async () => {
          reads += 1;
          if (reads === 1) throw new PublicationHttpError("busy", 429, 7);
          return integrity;
        },
        matches: (value) => value === integrity,
        retryError: (error) => error instanceof PublicationHttpError && error.retryable,
        timeoutMs: 20,
        initialDelayMs: 1,
        maxDelayMs: 2,
        random: () => 0.5,
        now: () => current,
        sleep: async (delayMs) => {
          delays.push(delayMs);
          current += delayMs;
        },
      }),
    ).resolves.toBe(integrity);
    expect(delays).toEqual([7]);
  });
  it("fails terminal read errors immediately", async () => {
    const read = vi.fn(async () => {
      throw new PublicationHttpError("unauthorized", 401);
    });
    await expect(
      observePublication({
        name: "candidate",
        read,
        matches: () => false,
        retryError: (error) => error instanceof PublicationHttpError && error.retryable,
      }),
    ).rejects.toThrow("unauthorized");
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe("distribution ordering and recovery", () => {
  it.effect.each(["artifacts", "npm", "tap"] as const)(
    "records %s failure and permits a rerun to reuse prior outputs",
    (failed) =>
      Effect.gen(function* () {
        const completed = new Set<string>();
        const writes: string[] = [];
        const records: PublicationStates[] = [];
        let failure = true;
        const boundaries = (["artifacts", "npm", "tap"] as const).map((name) => ({
          name,
          publish: () =>
            Effect.tryPromise({
              try: async () => {
                if (name === failed && failure) throw new Error("publisher failed");
                if (!completed.has(name)) {
                  writes.push(name);
                  completed.add(name);
                }
              },
              catch: releaseBoundaryError,
            }),
        }));
        const firstFailure = yield* Effect.flip(
          distributeRelease(Effect.void, boundaries, (state) => records.push(state)),
        );
        expect(firstFailure).toBeInstanceOf(ReleaseBoundaryFailed);
        expect(firstFailure).toHaveProperty("message", "publisher failed");
        expect(records.at(-1)?.[failed]).toBe("failed");
        failure = false;
        const outcome = yield* distributeRelease(Effect.void, boundaries, (state) =>
          records.push(state),
        );
        expect(outcome).toBe("distributed");
        expect(writes).toEqual(["artifacts", "npm", "tap"]);
        expect(records.at(-1)).toEqual({
          artifacts: "succeeded",
          npm: "succeeded",
          tap: "succeeded",
        });
      }),
  );
  it.effect("stops a superseded candidate before any historical publication repair", () =>
    Effect.gen(function* () {
      const publish = vi.fn(() => Effect.void);
      const outcome = yield* distributeRelease(
        Effect.fail(new SupersededRelease("1.2.3", "1.2.4", "npm")),
        [{ name: "artifacts", publish }],
        () => undefined,
      );
      expect(outcome).toBe("superseded");
      expect(publish).not.toHaveBeenCalled();
    }),
  );
  it.each(["npm", "Homebrew", "stable"])(
    "guards an older candidate at the %s write boundary",
    (owner) => {
      expect(() => guardPublicationVersion("1.2.3", "1.3.0", owner)).toThrow(SupersededRelease);
      expect(() => guardPublicationVersion("1.3.0", "1.2.3", owner)).not.toThrow();
      expect(() => guardPublicationVersion("1.3.0", "1.3.0", owner)).not.toThrow();
    },
  );
});

const assets = ["axm-darwin-arm64", "axm-darwin-x64", "axm-linux-arm64", "axm-linux-x64"];
const hashes = new Map(assets.map((name) => [name, "a".repeat(64)]));
const formula = (version: string) =>
  `class Axm < Formula\n  version "${version}"\n${assets.map((name) => `  url "https://github.com/agentxm/axm/releases/download/cli-v${version}/${name}"\n  sha256 "${"a".repeat(64)}"`).join("\n")}\nend\n`;

describe("Homebrew formula identity", () => {
  it("reuses an identical coordinate and all four descriptors", () => {
    expect(prepareFormula(formula("1.2.3"), "1.2.3", "agentxm/axm", hashes).changed).toBe(false);
  });
  it("updates all four immutable URLs with their checksums", () => {
    expect(prepareFormula(formula("1.2.2"), "1.2.3", "agentxm/axm", hashes).content).toBe(
      formula("1.2.3"),
    );
  });
  it.each(assets)("rejects equal-version wrong bytes for %s", (name) => {
    const changed = new Map(hashes).set(name, "b".repeat(64));
    expect(() => prepareFormula(formula("1.2.3"), "1.2.3", "agentxm/axm", changed)).toThrow(
      "integrity conflict",
    );
  });
  it("rejects equal-version wrong artifact coordinates", () => {
    expect(() =>
      prepareFormula(
        formula("1.2.3").replace("github.com/agentxm/", "github.com/other/"),
        "1.2.3",
        "agentxm/axm",
        hashes,
      ),
    ).toThrow("integrity conflict");
  });
  it("retains a newer formula", () => {
    expect(() => prepareFormula(formula("1.3.0"), "1.2.3", "agentxm/axm", hashes)).toThrow(
      SupersededRelease,
    );
  });
});

describe("npm publication observations", () => {
  it("requests revalidation of cached npm metadata before accepting publication facts", async () => {
    await expect(
      readNpmPublication("@agentxm/new-capability", "1.2.3", async (url, init) => {
        const headers = new Headers(init?.headers);
        return new URL(String(url)).searchParams.get("write") === "true" &&
          headers.get("cache-control") === "no-cache"
          ? Response.json({
              "dist-tags": { latest: "1.2.3" },
              versions: { "1.2.3": { dist: { integrity } } },
            })
          : new Response(null, { status: 404 });
      }),
    ).resolves.toEqual({ packageExists: true, latest: "1.2.3", integrity });
  });

  it("distinguishes a new package from a new version of an initialized package", async () => {
    await expect(
      readNpmPublication(
        "@agentxm/new-capability",
        "1.2.3",
        async () => new Response(null, { status: 404 }),
      ),
    ).resolves.toEqual({ packageExists: false, latest: null, integrity: null });
  });
  it.each([401, 403, 429, 503])("does not interpret HTTP %i as absence", async (status) => {
    await expect(
      readNpmPublication("axm.sh", "1.2.3", async () => new Response(null, { status })),
    ).rejects.toThrow(`HTTP ${status}`);
  });
  it("distinguishes a missing coordinate from an invalid published descriptor", async () => {
    const response = (versions: unknown) => async () =>
      new Response(JSON.stringify({ "dist-tags": { latest: "1.2.4" }, versions }));
    await expect(readNpmPublication("axm.sh", "1.2.3", response({}))).resolves.toEqual({
      packageExists: true,
      latest: "1.2.4",
      integrity: null,
    });
    await expect(
      readNpmPublication("axm.sh", "1.2.3", response({ "1.2.3": {} })),
    ).rejects.toThrow();
    await expect(
      readNpmPublication(
        "axm.sh",
        "1.2.3",
        response({ "0.1.0": {}, "1.2.3": { dist: { integrity } } }),
      ),
    ).resolves.toEqual({ packageExists: true, latest: "1.2.4", integrity });
  });

  it("reads an exact npm distribution tag without treating package absence as a version", async () => {
    const response = async () =>
      new Response(
        JSON.stringify({
          "dist-tags": { latest: "1.2.4", preview: "1.3.0-preview.4" },
          versions: {},
        }),
      );
    await expect(readNpmDistTag("axm.sh", "preview", response)).resolves.toBe("1.3.0-preview.4");
    await expect(
      readNpmDistTag("axm.sh", "preview", async () => new Response(null, { status: 404 })),
    ).resolves.toBeNull();
  });
});

describe("npm cohort initialization", () => {
  it.effect(
    "reports every missing package while accepting an initialized package without latest",
    () =>
      Effect.gen(function* () {
        const requests: string[] = [];
        const failure = yield* Effect.flip(
          requireInitializedNpmPackages(
            ["@agentxm/first", "@agentxm/ready", "@agentxm/second"],
            async (url) => {
              requests.push(String(url));
              return new URL(String(url)).pathname.endsWith("%2Fready")
                ? new Response(JSON.stringify({ "dist-tags": {}, versions: { "0.1.0": {} } }))
                : new Response(null, { status: 404 });
            },
          ),
        );
        expect(failure).toMatchObject({
          _tag: "NpmPackagesUninitialized",
          packages: ["@agentxm/first", "@agentxm/second"],
        });
        expect(requests).toEqual([
          "https://registry.npmjs.org/%40agentxm%2Ffirst?write=true",
          "https://registry.npmjs.org/%40agentxm%2Fready?write=true",
          "https://registry.npmjs.org/%40agentxm%2Fsecond?write=true",
        ]);
      }),
  );

  it.effect("accepts existing packages before their next version is published", () =>
    requireInitializedNpmPackages(
      ["@agentxm/ready"],
      async () =>
        new Response(
          JSON.stringify({ "dist-tags": { latest: "0.1.0" }, versions: { "0.1.0": {} } }),
        ),
    ),
  );

  for (const status of [401, 403, 429, 503]) {
    it.effect(`preserves HTTP ${status} as a failed query instead of claiming absence`, () =>
      Effect.gen(function* () {
        const failure = yield* Effect.flip(
          requireInitializedNpmPackages(
            ["@agentxm/ready"],
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
  }

  it.effect("rejects an invalid registry response", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        requireInitializedNpmPackages(["@agentxm/ready"], async () => new Response("{}")),
      );
      expect(failure._tag).toBe("NpmPackageQueryFailed");
    }),
  );

  it.effect("cancels the pending registry read when preparation is interrupted", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const aborted = yield* Deferred.make<void>();
      const read = yield* requireInitializedNpmPackages(
        ["@agentxm/ready"],
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
  it("does not write when latest already names the exact version", async () => {
    const promote = vi.fn();
    await expect(
      reconcileNpmStableTag({
        name: "axm.sh",
        version: "1.2.3",
        read: async () => "1.2.3",
        promote,
      }),
    ).resolves.toBe("already-current");
    expect(promote).not.toHaveBeenCalled();
  });

  it("repairs an older latest tag and confirms exact bounded readback", async () => {
    const observations = ["1.2.2", "1.2.2", "1.2.3"];
    const promote = vi.fn();
    await expect(
      reconcileNpmStableTag({
        name: "axm.sh",
        version: "1.2.3",
        read: async () => observations.shift() ?? "1.2.3",
        promote,
        observation: {
          now: (() => {
            let time = 0;
            return () => time++;
          })(),
          sleep: async () => undefined,
          random: () => 0,
        },
      }),
    ).resolves.toBe("promoted");
    expect(promote).toHaveBeenCalledOnce();
  });

  it("refuses to move latest backward when a newer release is visible", async () => {
    const promote = vi.fn();
    await expect(
      reconcileNpmStableTag({
        name: "axm.sh",
        version: "1.2.3",
        read: async () => "1.2.4",
        promote,
      }),
    ).rejects.toThrow(SupersededRelease);
    expect(promote).not.toHaveBeenCalled();
  });

  it("accepts a failed submission when readback proves the tag moved", async () => {
    const observations = ["1.2.2", "1.2.3"];
    await expect(
      reconcileNpmStableTag({
        name: "axm.sh",
        version: "1.2.3",
        read: async () => observations.shift() ?? "1.2.3",
        promote: async () => {
          throw new Error("connection reset after submit");
        },
        observation: { sleep: async () => undefined },
      }),
    ).resolves.toBe("promoted");
  });
});

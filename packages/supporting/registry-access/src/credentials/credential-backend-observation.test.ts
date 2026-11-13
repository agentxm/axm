import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as ConfigProvider from "effect/ConfigProvider";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions/handle";
import { CredentialStore, CredentialStoreLive, KeyringEntryLoader } from "./credential-store.js";
import { credentialFileFixture, credentialKeyOf } from "./test-helpers.js";
import { recordTrace } from "../test-support/test-helpers.js";

const registry = credentialKeyOf("https://registry.example.test");
const credentials = {
  access_token: "PRIVATE_ACCESS",
  refresh_token: "PRIVATE_REFRESH",
  expires_at: DateTime.makeUnsafe("2099-01-01T00:00:00Z"),
};

// Real restricted-file operations, with the native addon replaced only at its
// declared loader seam. This does not claim OS keychain packaging assurance.
const fixture = Effect.gen(function* () {
  const file = yield* credentialFileFixture;
  const native: string[] = [];
  const reads: string[] = [];
  let stored: string | null = null;
  let failRead = false;
  class Entry {
    getPassword() {
      native.push("read");
      if (failRead) throw new Error("PRIVATE_NATIVE_FAILURE");
      return stored;
    }
    setPassword(value: string) {
      native.push("write");
      stored = value;
    }
    deletePassword() {
      native.push("delete");
      stored = null;
    }
  }
  const fs: FileSystem.FileSystem = {
    ...file.fs,
    exists: (path) =>
      ["/.dockerenv", "/.containerenv", "/proc/version"].includes(path)
        ? Effect.succeed(false)
        : file.fs.exists(path),
    readFileString: (path, encoding) => {
      if (path === file.file) reads.push(path);
      return file.fs.readFileString(path, encoding);
    },
  };
  const nativeLayer = (loader = Effect.succeed(Entry)) =>
    Layer.fresh(CredentialStoreLive).pipe(
      Layer.provide(
        Layer.mergeAll(
          ConfigProvider.layer(ConfigProvider.fromEnvRecord({ AXM_USER_HOME: file.home })),
          Layer.succeed(FileSystem.FileSystem, fs),
          Layer.succeed(KeyringEntryLoader, loader),
        ),
      ),
    );
  return {
    ...file,
    nativeLayer,
    native,
    reads,
    failRead: () => {
      failRead = true;
    },
  };
});

it.live(
  "attributes native read/write/delete and missing-entry fallback to distinct intervals",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      const trace = recordTrace();
      yield* Effect.gen(function* () {
        const store = yield* CredentialStore;
        expect(store.tier).toBe("keychain");
        yield* store.save(registry, normalizeHandle("@fixture"), credentials);
        expect(Option.getOrThrow(yield* store.load(registry)).access_token).toBe(
          credentials.access_token,
        );
        yield* store.clear(registry);
      }).pipe(
        Effect.provide(f.nativeLayer()),
        Effect.withTracer(trace.tracer),
        Effect.withTracerEnabled(true),
      );
      expect(f.native).toEqual(["read", "write", "read", "delete"]);
      const native = trace.spans.filter(
        (span) =>
          span.name === "axm.auth.credential-backend" &&
          span.attributes.get("axm.credential.backend") === "keychain",
      );
      expect(native.map((span) => span.attributes.get("axm.credential.operation"))).toEqual(
        f.native,
      );
      expect(native.map((span) => span.attributes.get("axm.credential.outcome"))).toEqual([
        "missing",
        "success",
        "found",
        "success",
      ]);
      expect(f.reads).toHaveLength(5);
      const fallback = trace.spans.filter((span) => span.name === "axm.auth.credential-fallback");
      expect(fallback).toHaveLength(1);
      expect(fallback[0]?.attributes.get("axm.credential.fallback-reason")).toBe("missing");
      expect(
        trace.spans.filter(
          (span) =>
            span.name === "axm.auth.credential-backend" &&
            span.attributes.get("axm.credential.backend") === "restricted-file",
        ),
      ).toHaveLength(f.reads.length);
      expect(
        trace.spans
          .filter((span) => span.name.startsWith("axm.auth.credential-"))
          .map((span) => trace.endCounts.get(span.spanId)),
      ).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
      expect(
        JSON.stringify(native.map((span) => Object.fromEntries(span.attributes))),
      ).not.toContain("PRIVATE");
    }).pipe(Effect.provide(NodeServices.layer)),
);

it.live("records unavailable-keychain fallback while preserving the stored credential", () =>
  Effect.gen(function* () {
    const f = yield* fixture;
    // Seed through the existing restricted-file composition, before tracing.
    yield* Effect.flatMap(CredentialStore, (store) =>
      store.save(registry, normalizeHandle("@fixture"), credentials),
    ).pipe(Effect.provide(f.layer));
    const before = yield* f.fs.readFileString(f.file);
    f.failRead();
    const trace = recordTrace();
    const loaded = yield* Effect.flatMap(CredentialStore, (store) => store.load(registry)).pipe(
      Effect.provide(f.nativeLayer()),
      Effect.withTracer(trace.tracer),
      Effect.withTracerEnabled(true),
    );
    expect(Option.getOrThrow(loaded).access_token).toBe(credentials.access_token);
    expect(yield* f.fs.readFileString(f.file)).toBe(before);
    expect(f.native).toEqual(["read"]);
    expect(f.reads).toHaveLength(1);
    const backends = trace.spans.filter((span) => span.name === "axm.auth.credential-backend");
    expect(backends.map((span) => span.attributes.get("axm.credential.outcome"))).toEqual([
      "unavailable",
      "found",
    ]);
    const fallbacks = trace.spans.filter((span) => span.name === "axm.auth.credential-fallback");
    expect(fallbacks).toHaveLength(1);
    expect(fallbacks[0]?.attributes.get("axm.credential.fallback-reason")).toBe("unavailable");
    expect(fallbacks[0]?.attributes.get("axm.credential.outcome")).toBe("found");
    expect(
      trace.spans
        .filter((span) => span.name.startsWith("axm.auth.credential-"))
        .map((span) => trace.endCounts.get(span.spanId)),
    ).toEqual([1, 1, 1]);
    expect(
      JSON.stringify(trace.spans.map((span) => Object.fromEntries(span.attributes))),
    ).not.toContain("PRIVATE");
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.live("closes a cancelled native backend interval without selecting fallback", () =>
  Effect.gen(function* () {
    const f = yield* fixture;
    const entered = yield* Deferred.make<void>();
    const trace = recordTrace();
    const load = Effect.flatMap(CredentialStore, (store) => store.load(registry)).pipe(
      Effect.provide(
        f.nativeLayer(Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))),
      ),
      Effect.withTracer(trace.tracer),
      Effect.withTracerEnabled(true),
    );
    const fiber = yield* load.pipe(Effect.forkChild);
    yield* Deferred.await(entered);
    yield* Fiber.interrupt(fiber);
    expect(f.native).toEqual([]);
    expect(f.reads).toEqual([]);
    const backend = trace.spans.filter((span) => span.name === "axm.auth.credential-backend");
    expect(backend).toHaveLength(1);
    expect(backend[0]?.attributes.get("axm.credential.outcome")).toBe("interrupted");
    expect(backend.map((span) => trace.endCounts.get(span.spanId))).toEqual([1]);
    expect(trace.spans.some((span) => span.name === "axm.auth.credential-fallback")).toBe(false);
  }).pipe(Effect.provide(NodeServices.layer)),
);

import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions/handle";
import { CredentialStore } from "./index.js";
import { defineSpecification } from "@agentxm/specification-metadata";
import { credentialFileFixture } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/auth/persistence-preserves-committed-credentials",
  title: "Credential updates preserve committed sessions",
  statement:
    "When saving or clearing a Registry session, AXM shall preserve other Registries' committed credentials, including concurrent updates, shall leave the last committed file intact if replacement fails or is interrupted before commit, and shall refuse to overwrite credential storage it cannot read or decode.",
  class: "quality",
  characteristic: "reliability",
  role: "supporting",
  goals: ["machine-automation", "actionable-diagnostics"],
  boundary: "platform",
  boundaryRationale:
    "Independent live credential stores share a real temporary home; filesystem fault injection and interruption establish preservation at the persistence boundary.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: ["The local filesystem provides atomic same-filesystem rename."],
  openQuestions: [],
});

const registry = "https://registry.example.test";
const otherRegistry = "https://other.example.test";
const handle = normalizeHandle("@alice");
const credentials = {
  access_token: "fixture-access",
  refresh_token: "fixture-refresh",
  expires_at: DateTime.makeUnsafe("2030-01-01T00:00:00Z"),
};
const save = (origin = registry) =>
  Effect.flatMap(CredentialStore, (store) => store.save(origin, handle, credentials));
const failure = (method: string, path: string) =>
  PlatformError.systemError({
    _tag: "PermissionDenied",
    module: "FileSystem",
    method,
    pathOrDescriptor: path,
  });

describe("Committed credential integrity", () => {
  it.live("serializes the entire update when another invocation arrives before replacement", () =>
    Effect.gen(function* () {
      const fixture = yield* credentialFileFixture;
      const replacing = yield* Deferred.make<void>();
      const proceed = yield* Deferred.make<void>();
      const secondDone = yield* Deferred.make<void>();
      let directoryChecks = 0;
      // Pause the first writer at its second directory preparation, immediately
      // before writing. A separate invocation must not commit between this
      // writer's read and replacement, whichever filesystem preparation it uses.
      const pauseBeforeReplacement = Effect.suspend(() => {
        directoryChecks++;
        return directoryChecks === 2
          ? Deferred.succeed(replacing, undefined).pipe(Effect.andThen(Deferred.await(proceed)))
          : Effect.void;
      });
      const firstFs: FileSystem.FileSystem = {
        ...fixture.fs,
        exists: (path) =>
          path === fixture.directory
            ? pauseBeforeReplacement.pipe(Effect.andThen(fixture.fs.exists(path)))
            : fixture.fs.exists(path),
        makeDirectory: (path, options) =>
          path === fixture.directory
            ? pauseBeforeReplacement.pipe(Effect.andThen(fixture.fs.makeDirectory(path, options)))
            : fixture.fs.makeDirectory(path, options),
      };
      const first = yield* Effect.forkChild(
        save().pipe(
          Effect.provide(
            fixture.layer.pipe(Layer.provide(Layer.succeed(FileSystem.FileSystem, firstFs))),
          ),
        ),
      );
      yield* Deferred.await(replacing);
      const second = yield* Effect.forkChild(
        save(otherRegistry).pipe(
          Effect.provide(fixture.layer),
          Effect.tap(() => Deferred.succeed(secondDone, undefined)),
        ),
      );
      // The native file-lock waiter uses host time. Give a mistakenly admitted
      // second writer a turn; this is scheduling, not a latency obligation.
      yield* Effect.raceFirst(Deferred.await(secondDone), Effect.sleep("250 millis"));
      yield* Deferred.succeed(proceed, undefined);
      yield* Fiber.join(first);
      yield* Fiber.join(second);
      yield* Effect.gen(function* () {
        const store = yield* CredentialStore;
        for (const origin of [registry, otherRegistry]) {
          expect(Option.isSome(yield* store.load(origin))).toBe(true);
        }
      }).pipe(Effect.provide(fixture.layer));
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  for (const content of ["{", '{"version":1,"registries":false}']) {
    it.live("refuses to replace undecodable storage: " + content, () =>
      Effect.gen(function* () {
        const fixture = yield* credentialFileFixture;
        yield* fixture.fs.writeFileString(fixture.file, content, { mode: 0o600 });
        const error = yield* save().pipe(Effect.provide(fixture.layer), Effect.flip);
        expect(error).toMatchObject({
          _tag: "RegistryAccessFailed",
          detail: "Failed to parse credential file",
        });
        expect(yield* fixture.fs.readFileString(fixture.file)).toBe(content);
        expect(yield* fixture.fs.readDirectory(fixture.directory)).toEqual(["credentials.json"]);
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  }

  it.live("does not replace a credential file that cannot be inspected or read", () =>
    Effect.gen(function* () {
      const fixture = yield* credentialFileFixture;
      yield* save().pipe(Effect.provide(fixture.layer));
      const before = yield* fixture.fs.readFileString(fixture.file);
      for (const operation of ["readFileString", "stat"] as const) {
        const failedFs: FileSystem.FileSystem = {
          ...fixture.fs,
          readFileString: (path, ...options) =>
            path === fixture.file && operation === "readFileString"
              ? Effect.fail(failure(operation, path))
              : fixture.fs.readFileString(path, ...options),
          stat: (path) =>
            path === fixture.file && operation === "stat"
              ? Effect.fail(failure(operation, path))
              : fixture.fs.stat(path),
        };
        const error = yield* save(otherRegistry).pipe(
          Effect.provide(
            fixture.layer.pipe(Layer.provide(Layer.succeed(FileSystem.FileSystem, failedFs))),
          ),
          Effect.flip,
        );
        expect(error).toMatchObject({
          _tag: "RegistryAccessFailed",
          category: "auth",
          cause: { reason: { _tag: "PermissionDenied" } },
        });
        expect(yield* fixture.fs.readFileString(fixture.file)).toBe(before);
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.live("retains every concurrent Registry update from independent stores", () =>
    Effect.gen(function* () {
      const fixture = yield* credentialFileFixture;
      const registries = Array.from(
        { length: 8 },
        (_, index) => `https://registry-${index}.example.test`,
      );
      yield* Effect.forEach(
        registries,
        (origin) => save(origin).pipe(Effect.provide(fixture.layer)),
        { concurrency: registries.length },
      );
      yield* Effect.gen(function* () {
        const store = yield* CredentialStore;
        for (const origin of registries) {
          expect(Option.getOrThrow(yield* store.load(origin)).access_token).toBe(
            credentials.access_token,
          );
        }
      }).pipe(Effect.provide(fixture.layer));
      expect((yield* fixture.fs.stat(fixture.file)).mode & 0o777).toBe(0o600);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.live("preserves another Registry when a clear and a save overlap", () =>
    Effect.gen(function* () {
      const fixture = yield* credentialFileFixture;
      yield* save().pipe(Effect.provide(fixture.layer));
      yield* Effect.all(
        [
          Effect.flatMap(CredentialStore, (store) => store.clear(registry)).pipe(
            Effect.provide(fixture.layer),
          ),
          save(otherRegistry).pipe(Effect.provide(fixture.layer)),
        ],
        { concurrency: 2 },
      );
      yield* Effect.gen(function* () {
        const store = yield* CredentialStore;
        expect(Option.isNone(yield* store.load(registry))).toBe(true);
        expect(Option.getOrThrow(yield* store.load(otherRegistry)).access_token).toBe(
          credentials.access_token,
        );
      }).pipe(Effect.provide(fixture.layer));
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  for (const point of ["write", "rename", "interrupt"] as const) {
    it.live("preserves the last committed file after a partial replacement: " + point, () =>
      Effect.gen(function* () {
        const fixture = yield* credentialFileFixture;
        yield* save().pipe(Effect.provide(fixture.layer));
        const before = yield* fixture.fs.readFileString(fixture.file);
        const partial = yield* Deferred.make<void>();
        const failedFs: FileSystem.FileSystem = {
          ...fixture.fs,
          writeFileString: (path, content, options) =>
            point !== "rename" && path.endsWith("/credentials.json")
              ? fixture.fs
                  .writeFileString(path, content.slice(0, 9), options)
                  .pipe(
                    Effect.andThen(Deferred.succeed(partial, undefined)),
                    Effect.andThen(
                      point === "interrupt"
                        ? Effect.never
                        : Effect.fail(failure("writeFileString", path)),
                    ),
                  )
              : fixture.fs.writeFileString(path, content, options),
          rename: (from, to) =>
            point === "rename" && to === fixture.file
              ? Effect.fail(failure("rename", to))
              : fixture.fs.rename(from, to),
        };
        const program = save(otherRegistry).pipe(
          Effect.provide(
            fixture.layer.pipe(Layer.provide(Layer.succeed(FileSystem.FileSystem, failedFs))),
          ),
        );
        if (point === "interrupt") {
          const fiber = yield* Effect.forkChild(program);
          yield* Deferred.await(partial);
          yield* Fiber.interrupt(fiber);
        } else {
          expect(yield* Effect.flip(program)).toMatchObject({
            _tag: "RegistryAccessFailed",
            detail: "Failed to write credential file",
          });
        }
        expect(yield* fixture.fs.readFileString(fixture.file)).toBe(before);
        expect(yield* fixture.fs.readDirectory(fixture.directory)).toEqual(["credentials.json"]);
        // The lock and staged resources have been released, so a later update works.
        yield* save(otherRegistry).pipe(Effect.provide(fixture.layer));
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  }
});

import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/specification-metadata";
import { createLocalRegistryClient } from "./index.js";
import { exactVersion, extensionName, handle } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "registry/local-publication-coordinates-owners",
  title: "Local publication coordinates owners and releases cancelled waits",
  statement:
    "AXM shall serialize publications to the same local Registry extension across independently created clients and processes, allow unrelated extensions to proceed, release a cancelled wait without modifying the current owner's lock or committed publication, and allow subsequent publication after the owner releases the lock. An aged live owner shall retain its lock; recovery and release shall preserve replacement owners and report operational storage failures.",
  class: "quality",
  characteristic: "reliability",
  role: "supporting",
  goals: ["safe-repetition", "trustworthy-distribution"],
  boundary: "platform",
  boundaryRationale:
    "Independent public local Registry clients publish to native temporary storage. A controlled index-read boundary holds a real filesystem lock while another client is interrupted; byte readback and later publications establish ownership and recovery. Process evidence also delivers SIGINT to the CLI while it waits for a live owner's lock.",
  selection: "per-change",
  methods: ["example", "contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "The local filesystem provides atomic exclusive hard links within the Registry directory.",
    "Publishers reporting the same hostname share one PID namespace and cooperate with the publication lock protocol; lock files are not concurrently replaced by external manual operations.",
  ],
  openQuestions: [],
});

const target = { owner: handle("@test"), type: "skill", name: extensionName("shared") } as const;
const publish = (version: string, name = target.name) => ({
  ...target,
  name,
  version: exactVersion(version),
  archive: new Uint8Array([1, 2, 3]),
  metadata: {
    version: exactVersion(version),
    published: DateTime.makeUnsafe("2025-01-01T00:00:00Z"),
    integrity: "sha512-AAAA==",
    packages: [],
  },
  visibilityInput: { intent: null, request: null },
});

describe("Local publication ownership", () => {
  it.live("independent clients preserve every concurrently published version", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-publication-owners-" });
      yield* Effect.forEach(
        ["1.0.0", "1.1.0", "1.2.0"],
        (version) => createLocalRegistryClient(root, fs, path).publishExtension(publish(version)),
        { concurrency: 3 },
      );
      const client = createLocalRegistryClient(root, fs, path);
      expect(
        Option.getOrThrow(yield* client.getExtensionIndex(target))
          .versions.map((v) => v.version)
          .sort(),
      ).toEqual(["1.0.0", "1.1.0", "1.2.0"]);
      expect(
        (yield* fs.readDirectory(
          path.join(root, "extensions", "@test", "skills", "shared"),
        )).sort(),
      ).toEqual(["1.0.0.zip", "1.1.0.zip", "1.2.0.zip", "index.json"]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.live(
    "cancels a waiter, preserves its owner, permits another key, and publishes after release",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-publication-cancellation-" });
        const client = createLocalRegistryClient(root, fs, path);
        yield* client.publishExtension(publish("1.0.0"));
        const directory = path.join(root, "extensions", "@test", "skills", "shared");
        const indexPath = path.join(directory, "index.json");
        const lockPath = path.join(directory, ".publish.lock");
        const before = yield* fs.readFileString(indexPath);
        const held = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const attempted = yield* Deferred.make<void>();
        const holder = createLocalRegistryClient(
          root,
          FileSystem.FileSystem.of({
            ...fs,
            readFileString: (requested, options) =>
              requested === indexPath
                ? Deferred.succeed(held, undefined).pipe(
                    Effect.andThen(Deferred.await(release)),
                    Effect.andThen(fs.readFileString(requested, options)),
                  )
                : fs.readFileString(requested, options),
          }),
          path,
        );
        const active = yield* Effect.forkChild(holder.publishExtension(publish("1.1.0")));
        yield* Deferred.await(held);
        const ownerBefore = yield* fs.readFileString(lockPath);
        const waitingClient = createLocalRegistryClient(
          root,
          FileSystem.FileSystem.of({
            ...fs,
            link: (from, to) =>
              fs.link(from, to).pipe(Effect.tapError(() => Deferred.succeed(attempted, undefined))),
          }),
          path,
        );
        const waiting = yield* Effect.forkChild(waitingClient.publishExtension(publish("1.2.0")));
        yield* Deferred.await(attempted);
        yield* Fiber.interrupt(waiting).pipe(Effect.timeout("1 second"));
        expect(yield* fs.readFileString(indexPath)).toBe(before);
        expect(yield* fs.readFileString(lockPath)).toBe(ownerBefore);
        expect(yield* fs.exists(path.join(directory, "1.2.0.zip"))).toBe(false);
        yield* client
          .publishExtension(publish("1.0.0", extensionName("independent")))
          .pipe(Effect.timeout("1 second"));
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(active);
        yield* createLocalRegistryClient(root, fs, path).publishExtension(publish("1.2.0"));
        expect(
          Option.getOrThrow(yield* client.getExtensionIndex(target))
            .versions.map((v) => v.version)
            .sort(),
        ).toEqual(["1.0.0", "1.1.0", "1.2.0"]);
        expect((yield* fs.readDirectory(directory)).sort()).toEqual([
          "1.0.0.zip",
          "1.1.0.zip",
          "1.2.0.zip",
          "index.json",
        ]);
      }).pipe(Effect.provide(NodeServices.layer)),
  );
});

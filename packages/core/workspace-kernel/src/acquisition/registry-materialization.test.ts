import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { zipSync } from "fflate";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { sha512Integrity } from "@agentxm/host-primitives";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import {
  makeFileRegistry,
  OfflineHttpClient,
  RegistryClientFactoryTest,
} from "@agentxm/registry-client/testing";
import {
  MAX_OPERATION_BUFFERED_ARCHIVE_BYTES,
  OperationBufferedArchiveBudget,
  VerifiedArchive,
  makeOperationBufferedArchiveBudget,
} from "@agentxm/registry-client";
import type { RegistrySubagentRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import { workObservations } from "../locations/testing.js";
import {
  AcquiredContent,
  extractExternalArchive,
  materializeRegistryPackageWithTreeIntegrity,
  sourceRefContentKey,
} from "./index.js";

const platform = Layer.provideMerge(
  RegistryClientFactoryTest(OfflineHttpClient),
  NodeServices.layer,
);

describe("Registry package payload fidelity", () => {
  it.effect("retains executable modes, empty directories, and contained links", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const registry = yield* Effect.acquireRelease(
        Effect.sync(() => makeFileRegistry()),
        (registry) => Effect.sync(() => registry.cleanup()),
      );
      registry.writeSkill("review", [{ version: "1.0.0", body: "Review" }]);
      const archivePath = registry.storedFiles().find((file) => file.endsWith("1.0.0.zip"));
      if (archivePath === undefined) return yield* Effect.die(new Error("Fixture archive missing"));
      const encode = (text: string) => new TextEncoder().encode(text);
      const archive = zipSync({
        "skill.json": encode('{"owner":"@acme","type":"skill","name":"review","version":"1.0.0"}'),
        "src/SKILL.md": encode("# Review\r\n"),
        "src/run": [encode("#!/bin/sh\necho review\n"), { os: 3, attrs: 0o100755 << 16 }],
        "src/run-link": [encode("run"), { os: 3, attrs: 0o120777 << 16 }],
        "src/cycle": [encode("."), { os: 3, attrs: 0o120777 << 16 }],
        "src/a": [encode("b"), { os: 3, attrs: 0o120777 << 16 }],
        "src/b": [encode("a"), { os: 3, attrs: 0o120777 << 16 }],
        "src/empty/": new Uint8Array(),
      });
      yield* fs.writeFile(path.join(registry.root, archivePath), archive);
      yield* fs.writeFileString(
        path.join(registry.root, path.dirname(archivePath), "index.json"),
        JSON.stringify({
          owner: "@acme",
          type: "skill",
          name: "review",
          publisherBindingId: "hbnd_test",
          archival: null,
          deprecation: null,
          versions: [
            {
              version: "1.0.0",
              published: "2026-11-13T12:00:00Z",
              integrity: sha512Integrity(archive),
            },
          ],
        }),
      );
      const baseDir = yield* fs.makeTempDirectoryScoped({ prefix: "axm-registry-payload-" });
      const destinationPath = path.join(baseDir, "package");
      const result = yield* materializeRegistryPackageWithTreeIntegrity({
        baseDir,
        destinationPath,
        transient: true,
        sourceLocation: decodeRegistryEndpointSync(registry.url),
        owner: decodeHandleSync("@acme"),
        type: "skill",
        name: decodeExtensionNameSync("review"),
        version: decodeVersionSync("1.0.0"),
        integrity: Option.some(sha512Integrity(archive)),
        publisherBindingId: "hbnd_test",
        messages: { integrityMismatchDetail: "Fixture integrity" },
      });
      expect(result.canonicalPath).toBe(destinationPath);
      expect(yield* fs.readFileString(path.join(destinationPath, "src/SKILL.md"))).toBe(
        "# Review\r\n",
      );
      expect((yield* fs.stat(path.join(destinationPath, "src/run"))).mode & 0o111).toBe(0o111);
      expect(yield* fs.readLink(path.join(destinationPath, "src/run-link"))).toBe("run");
      expect(yield* fs.readLink(path.join(destinationPath, "src/cycle"))).toBe(".");
      expect(yield* fs.readLink(path.join(destinationPath, "src/a"))).toBe("b");
      expect(yield* fs.readLink(path.join(destinationPath, "src/b"))).toBe("a");
      expect(yield* fs.readDirectory(path.join(destinationPath, "src/empty"))).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );
});

describe("Registry archive integrity before extraction", () => {
  it.effect("hashes a file Registry archive once between admission and extraction", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const registry = yield* Effect.acquireRelease(
        Effect.sync(() => makeFileRegistry()),
        (registry) => Effect.sync(() => registry.cleanup()),
      );
      registry.writeSkill("review", [{ version: "1.0.0", body: "Review" }]);
      const archivePath = registry.storedFiles().find((file) => file.endsWith("1.0.0.zip"));
      if (archivePath === undefined) return yield* Effect.die(new Error("Fixture archive missing"));
      const integrity = sha512Integrity(yield* fs.readFile(path.join(registry.root, archivePath)));
      const baseDir = yield* fs.makeTempDirectoryScoped({ prefix: "axm-registry-integrity-" });
      const destinationPath = path.join(baseDir, "package");
      const observed = workObservations(false);
      yield* materializeRegistryPackageWithTreeIntegrity({
        baseDir,
        destinationPath,
        transient: true,
        sourceLocation: decodeRegistryEndpointSync(registry.url),
        owner: decodeHandleSync("@acme"),
        type: "skill",
        name: decodeExtensionNameSync("review"),
        version: decodeVersionSync("1.0.0"),
        integrity: Option.some(integrity),
        publisherBindingId: "hbnd_test",
        messages: { integrityMismatchDetail: "Fixture integrity" },
      }).pipe(observed.provide);
      expect(observed.facts.filter((fact) => fact.kind === "axm.archive.integrity")).toHaveLength(
        1,
      );
      expect(yield* fs.exists(path.join(destinationPath, "skill.json"))).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect("leaves the verified archive buffer unchanged through extraction", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const encode = (text: string) => new TextEncoder().encode(text);
      const archive = zipSync({
        "skill.json": encode('{"owner":"@acme","type":"skill","name":"review","version":"1.0.0"}'),
        "src/SKILL.md": encode("# Review\n"),
      });
      const integrity = sha512Integrity(archive);
      const verified = Option.getOrThrow(yield* VerifiedArchive.check(archive, integrity));
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "axm-registry-extract-" });
      yield* extractExternalArchive(verified.bytes, "zip", directory);
      expect(sha512Integrity(archive)).toBe(integrity);
      expect(verified.covers(archive, integrity)).toBe(true);
      expect(yield* fs.readFileString(path.join(directory, "src/SKILL.md"))).toBe("# Review\n");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

describe("Registry package buffered-archive reservation", () => {
  const admissions = (facts: ReadonlyArray<{ readonly kind: string }>) =>
    facts.filter((fact) => fact.kind === "axm.admission.buffered-archive").length;

  const withBudget = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const budget = yield* makeOperationBufferedArchiveBudget(
        MAX_OPERATION_BUFFERED_ARCHIVE_BYTES,
      );
      return yield* Effect.provideService(effect, OperationBufferedArchiveBudget, budget);
    });

  it.effect("copies a tree the transition already acquired without a reservation", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const baseDir = yield* fs.makeTempDirectoryScoped({ prefix: "axm-registry-prepared-" });
      const source = path.join(baseDir, "acquired");
      yield* fs.makeDirectory(path.join(source, "src"), { recursive: true });
      yield* fs.writeFileString(path.join(source, "subagent.json"), "{}");
      yield* fs.writeFileString(path.join(source, "src", "review.md"), "Review the change.");
      const ref: RegistrySubagentRef = {
        type: "subagent",
        refType: "registry",
        subagent: { name: decodeExtensionNameSync("review"), description: Option.none() },
        source: {
          type: "registry",
          name: "test",
          location: decodeRegistryEndpointSync("https://registry.example"),
          owner: Option.some(decodeHandleSync("@acme")),
        },
        owner: decodeHandleSync("@acme"),
        publisherBindingId: "binding-1",
        name: decodeExtensionNameSync("review"),
        version: decodeVersionSync("1.0.0"),
        integrity: Option.none(),
        packages: [],
      };
      const destinationPath = path.join(baseDir, "package");
      const observed = workObservations(false);

      yield* materializeRegistryPackageWithTreeIntegrity({
        baseDir,
        destinationPath,
        transient: true,
        sourceLocation: ref.source.location,
        owner: ref.owner,
        type: ref.type,
        name: ref.name,
        version: ref.version,
        integrity: ref.integrity,
        publisherBindingId: ref.publisherBindingId,
        messages: { integrityMismatchDetail: "Fixture integrity" },
      }).pipe(
        Effect.provideService(AcquiredContent, {
          requestedKeys: new Set([sourceRefContentKey(ref)]),
          filesByKey: new Map([[sourceRefContentKey(ref), { directory: source }]]),
          failuresByKey: new Map(),
        }),
        withBudget,
        observed.provide,
      );

      expect(admissions(observed.facts)).toBe(0);
      expect(yield* fs.readFileString(path.join(destinationPath, "src", "review.md"))).toBe(
        "Review the change.",
      );
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect("holds one buffered-archive reservation for a fetched archive through staging", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const registry = yield* Effect.acquireRelease(
        Effect.sync(() => makeFileRegistry()),
        (registry) => Effect.sync(() => registry.cleanup()),
      );
      registry.writeSkill("review", [{ version: "1.0.0", body: "Review" }]);
      const archivePath = registry.storedFiles().find((file) => file.endsWith("1.0.0.zip"));
      if (archivePath === undefined) return yield* Effect.die(new Error("Fixture archive missing"));
      const integrity = sha512Integrity(yield* fs.readFile(path.join(registry.root, archivePath)));
      const baseDir = yield* fs.makeTempDirectoryScoped({ prefix: "axm-registry-fetched-" });
      const destinationPath = path.join(baseDir, "package");
      const observed = workObservations(false);
      const budget = yield* makeOperationBufferedArchiveBudget(
        MAX_OPERATION_BUFFERED_ARCHIVE_BYTES,
      );
      // Mark the span in which the reservation is held around the real budget.
      let held = false;
      const heldWhileStaged: Array<boolean> = [];
      const tracked = OperationBufferedArchiveBudget.of({
        capacityBytes: budget.capacityBytes,
        withBufferedArchive: (effect) =>
          budget.withBufferedArchive(
            Effect.acquireUseRelease(
              Effect.sync(() => {
                held = true;
              }),
              () => effect,
              () =>
                Effect.sync(() => {
                  held = false;
                }),
            ),
          ),
      });

      yield* materializeRegistryPackageWithTreeIntegrity({
        baseDir,
        destinationPath,
        transient: true,
        validate: (stagingPath) =>
          fs.exists(path.join(stagingPath, "skill.json")).pipe(
            Effect.flatMap((staged) =>
              staged
                ? Effect.sync(() => {
                    heldWhileStaged.push(held);
                  })
                : Effect.die(new Error("Extracted archive missing from staging")),
            ),
            Effect.orDie,
          ),
        sourceLocation: decodeRegistryEndpointSync(registry.url),
        owner: decodeHandleSync("@acme"),
        type: "skill",
        name: decodeExtensionNameSync("review"),
        version: decodeVersionSync("1.0.0"),
        integrity: Option.some(integrity),
        publisherBindingId: "hbnd_test",
        messages: { integrityMismatchDetail: "Fixture integrity" },
      }).pipe(Effect.provideService(OperationBufferedArchiveBudget, tracked), observed.provide);

      expect(admissions(observed.facts)).toBe(1);
      // Extraction and validation of the staged tree run under the reservation.
      expect(heldWhileStaged).toEqual([true]);
      expect(held).toBe(false);
      expect(yield* fs.exists(path.join(destinationPath, "skill.json"))).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );
});

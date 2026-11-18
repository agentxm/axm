import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as HttpClient from "effect/http/HttpClient";
import * as Option from "effect/Option";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { CurrentWorkObserver, type WorkFact } from "@agentxm/host-primitives/work-observation";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { makeRegistryClientFactory } from "./registry-client-factory.js";
import { exactVersion, extensionName, handle, versionRange } from "./test-helpers.js";

it.effect("admits file Registry items independently without HTTP or credential lookup", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-local-admission-" });
    const bytes = new Uint8Array([1, 2, 3]);
    const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
    for (const name of ["first", "second"]) {
      const dir = path.join(root, "extensions", "@acme", "skills", name);
      yield* fs.makeDirectory(dir, { recursive: true });
      yield* fs.writeFile(path.join(dir, "1.0.0.zip"), bytes);
      yield* fs.writeFileString(
        path.join(dir, "index.json"),
        JSON.stringify({
          owner: "@acme",
          type: "skill",
          name,
          publisherBindingId: "publisher",
          archival: null,
          deprecation: null,
          versions: [{ version: "1.0.0", published: "2026-11-13T12:00:00Z", integrity }],
        }),
      );
    }
    const factory = yield* makeRegistryClientFactory({
      fileSystem: fs,
      path,
      httpClient: HttpClient.make(() => Effect.die("Unexpected HTTP request")),
      authorization: {
        currentContext: () => Effect.die("Unexpected credential context lookup"),
        authorize: () => {
          throw new Error("Unexpected credential lookup");
        },
      },
    });
    const endpoint = decodeRegistryEndpointSync(pathToFileURL(root).href);
    expect(yield* factory.authorityContext(endpoint)).toEqual(
      yield* factory.authorityContext(endpoint),
    );
    const client = yield* factory.forEndpoint(endpoint);
    const args = ["first", "second"].map((name) => ({
      owner: handle("@acme"),
      type: "skill" as const,
      name: extensionName(name),
      exact: { version: exactVersion("1.0.0"), integrity, publisherBindingId: "publisher" },
    }));
    expect((yield* client.validateExtensionAccessBatch(args)).every(Result.isSuccess)).toBe(true);
    yield* client.withAccessibleContent(args, (content) =>
      Effect.gen(function* () {
        yield* fs.writeFile(
          path.join(root, "extensions", "@acme", "skills", "first", "1.0.0.zip"),
          new Uint8Array([4]),
        );
        const reads = yield* Effect.forEach(args, (item) => Effect.result(content.read(item)));
        expect(reads.map(Result.isSuccess)).toEqual([false, true]);
        const denied = reads[0];
        expect(denied !== undefined && Result.isFailure(denied) && denied.failure.category).toBe(
          "conflict",
        );
      }),
    );
    const results = yield* client.validateExtensionAccessBatch(args);
    expect(results.map(Result.isSuccess)).toEqual([false, true]);
    const first = results[0];
    expect(first !== undefined && Result.isFailure(first) && first.failure.category).toBe(
      "conflict",
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

describe("file Registry single-item content reads", () => {
  // Below one 64 KiB stream chunk: each stream is one data read and one end-of-file read.
  const bytes = new Uint8Array(Array.from({ length: 1024 }, (_, index) => index % 251));
  const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;

  const fixture = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-local-exact-read-" });
    const dir = path.join(root, "extensions", "@acme", "skills", "single");
    yield* fs.makeDirectory(dir, { recursive: true });
    yield* fs.writeFile(path.join(dir, "1.0.0.zip"), bytes);
    yield* fs.writeFileString(
      path.join(dir, "index.json"),
      JSON.stringify({
        owner: "@acme",
        type: "skill",
        name: "single",
        publisherBindingId: "publisher",
        archival: null,
        deprecation: null,
        versions: [{ version: "1.0.0", published: "2026-11-13T12:00:00Z", integrity }],
      }),
    );
    const { fileSystem, recording } = makeRecordingFileSystem(fs);
    const factory = yield* makeRegistryClientFactory({
      fileSystem,
      path,
      httpClient: HttpClient.make(() => Effect.die("Unexpected HTTP request")),
      authorization: {
        currentContext: () => Effect.die("Unexpected credential context lookup"),
        authorize: () => {
          throw new Error("Unexpected credential lookup");
        },
      },
    });
    const client = yield* factory.forEndpoint(decodeRegistryEndpointSync(pathToFileURL(root).href));
    const facts: WorkFact[] = [];
    recording.reset();
    const measure = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(
        Effect.provideService(CurrentWorkObserver, {
          record: (fact) => {
            facts.push(fact);
          },
          detailSelected: () => false,
        }),
      );
    const observed = () => {
      const archive = recording.counts(path.join(dir, "1.0.0.zip"));
      const index = recording.counts(path.join(dir, "index.json"));
      return {
        archive: {
          access: archive.access ?? 0,
          stat: archive.stat ?? 0,
          open: archive.open ?? 0,
          readAlloc: archive["file.readAlloc"] ?? 0,
          contentReads: recording.contentReads(path.join(dir, "1.0.0.zip")),
        },
        index: { access: index.access ?? 0, readFile: index.readFile ?? 0 },
        integrity: facts.filter((fact) => fact.kind === "axm.archive.integrity").length,
      };
    };
    return { client, dir, measure, observed };
  });
  const exact = {
    owner: handle("@acme"),
    type: "skill" as const,
    name: extensionName("single"),
    exact: { version: exactVersion("1.0.0"), integrity, publisherBindingId: "publisher" },
  };

  it.effect("returns the bytes its admission verified from one archive read", () =>
    Effect.gen(function* () {
      const { client, measure, observed } = yield* fixture;
      const response = yield* measure(client.getExtensionPackage({ ...exact }));
      expect(observed()).toEqual({
        archive: { access: 0, stat: 1, open: 1, readAlloc: 2, contentReads: 2 },
        index: { access: 0, readFile: 1 },
        integrity: 1,
      });
      expect(Array.from(response.archive)).toEqual(Array.from(bytes));
      expect(response.verified?.covers(response.archive, integrity)).toBe(true);
      expect(response.warnings).toBeUndefined();
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("returns lifecycle warnings with the admitted bytes", () =>
    Effect.gen(function* () {
      const { client, measure } = yield* fixture;
      const warnings = ["Previously selected version is deprecated"];
      const response = yield* measure(
        client.getExtensionPackage({
          ...exact,
          exact: { ...exact.exact, lifecycleWarnings: warnings },
        }),
      );
      expect(response.warnings).toEqual(warnings);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("reads admitted bytes again inside a content callback", () =>
    Effect.gen(function* () {
      const { client, measure, observed } = yield* fixture;
      const response = yield* measure(
        client.withAccessibleContent([exact], (content) => content.read(exact)),
      );
      expect(observed()).toEqual({
        archive: { access: 1, stat: 2, open: 2, readAlloc: 4, contentReads: 4 },
        index: { access: 0, readFile: 1 },
        integrity: 2,
      });
      expect(response.verified?.covers(response.archive, integrity)).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("admits a batch item from one archive read without returning bytes", () =>
    Effect.gen(function* () {
      const { client, measure, observed } = yield* fixture;
      const results = yield* measure(client.validateExtensionAccessBatch([exact]));
      expect(results).toHaveLength(1);
      expect(results.every(Result.isSuccess)).toBe(true);
      expect(results.map((result) => Result.isSuccess(result) && result.success)).toEqual([
        undefined,
      ]);
      expect(observed()).toEqual({
        archive: { access: 0, stat: 1, open: 1, readAlloc: 2, contentReads: 2 },
        index: { access: 0, readFile: 1 },
        integrity: 1,
      });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("selects, admits and reads a version range", () =>
    Effect.gen(function* () {
      const { client, measure, observed } = yield* fixture;
      const response = yield* measure(
        client.getExtensionPackage({
          owner: exact.owner,
          type: exact.type,
          name: exact.name,
          version: Option.some(versionRange("^1.0.0")),
        }),
      );
      expect(observed()).toEqual({
        archive: { access: 1, stat: 2, open: 2, readAlloc: 4, contentReads: 4 },
        index: { access: 1, readFile: 2 },
        integrity: 2,
      });
      expect(response.verified?.covers(response.archive, integrity)).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses a missing, tampered or reassigned archive as admission does", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { client, dir } = yield* fixture;
      const archivePath = path.join(dir, "1.0.0.zip");
      const read = (args: typeof exact) => client.getExtensionPackage(args).pipe(Effect.flip);

      expect(
        yield* read({ ...exact, exact: { ...exact.exact, publisherBindingId: "other" } }),
      ).toMatchObject({
        category: "conflict",
        detail: "Local Registry no longer matches the accepted publisher and archive identity.",
      });
      yield* fs.writeFile(archivePath, new Uint8Array([4]));
      expect(yield* read(exact)).toMatchObject({
        category: "conflict",
        detail: "Local Registry archive integrity no longer matches the accepted identity.",
      });
      yield* fs.remove(archivePath);
      expect(yield* read(exact)).toMatchObject({
        category: "not_found",
        detail: "Accepted local Registry archive is unavailable.",
      });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

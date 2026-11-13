import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as HttpClient from "effect/http/HttpClient";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { makeRegistryClientFactory } from "./registry-client-factory.js";
import { exactVersion, extensionName, handle } from "./test-helpers.js";

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
        authorize: () => {
          throw new Error("Unexpected credential lookup");
        },
      },
    });
    const client = yield* factory.forEndpoint(decodeRegistryEndpointSync(pathToFileURL(root).href));
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

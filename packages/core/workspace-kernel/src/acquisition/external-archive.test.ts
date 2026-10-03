import { zipSync } from "fflate";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { extractExternalArchive } from "./external-archive.js";

it.effect("counts implicit archive directories before creating any payload entries", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-archive-entry-limit-" });
    const payload = zipSync({ "one/two/three/file.txt": new TextEncoder().encode("bytes") });
    const failure = yield* extractExternalArchive(payload, "zip", root, { maxEntries: 3 }).pipe(
      Effect.result,
    );
    expect(failure).toMatchObject({
      _tag: "Failure",
      failure: { detail: expect.stringContaining("implicit directories") },
    });
    expect(yield* fs.readDirectory(root)).toEqual([]);
    yield* extractExternalArchive(payload, "zip", root, { maxEntries: 4 });
    expect(yield* fs.readFileString(`${root}/one/two/three/file.txt`)).toBe("bytes");
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("rejects parent spelling collisions before extraction", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-archive-parent-collision-" });
    const payload = zipSync({ "Assets/one": new Uint8Array(), "assets/two": new Uint8Array() });
    const failure = yield* extractExternalArchive(payload, "zip", root).pipe(Effect.result);
    expect(failure).toMatchObject({
      _tag: "Failure",
      failure: { detail: expect.stringContaining("Case-fold collision") },
    });
    expect(yield* fs.readDirectory(root)).toEqual([]);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

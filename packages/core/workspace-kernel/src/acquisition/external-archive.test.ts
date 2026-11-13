import { zipSync } from "fflate";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Tracer from "effect/Tracer";
import * as FileSystem from "effect/FileSystem";
import { extractExternalArchive } from "./external-archive.js";

it.effect("counts implicit archive directories before creating any payload entries", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-archive-entry-limit-" });
    const payload = zipSync({ "one/two/three/file.txt": new TextEncoder().encode("bytes") });
    const spans: Tracer.NativeSpan[] = [];
    const tracer = Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options);
        spans.push(span);
        return span;
      },
    });
    const failure = yield* extractExternalArchive(payload, "zip", root, { maxEntries: 3 }).pipe(
      Effect.result,
      Effect.withTracer(tracer),
    );
    expect(failure).toMatchObject({
      _tag: "Failure",
      failure: { detail: expect.stringContaining("implicit directories") },
    });
    expect(yield* fs.readDirectory(root)).toEqual([]);
    yield* extractExternalArchive(payload, "zip", root, { maxEntries: 4 }).pipe(
      Effect.withTracer(tracer),
    );
    const decodes = spans.filter((span) => span.name === "axm.archive.external-decode");
    expect(decodes).toHaveLength(2);
    expect(
      decodes.map((span) => (span.status._tag === "Ended" ? span.status.exit._tag : "Started")),
    ).toEqual(["Failure", "Success"]);
    expect(decodes[1]?.attributes.get("axm.work.count")).toBe(1);
    expect(decodes[1]?.attributes.get("axm.work.bytes")).toBe(5);
    expect(decodes[1]?.attributes.get("axm.archive.bytes")).toBe(payload.byteLength);
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

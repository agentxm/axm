import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Tracer from "effect/Tracer";
import { NativePlatformTest, withDetailedWork } from "../locations/testing.js";
import { observePathState } from "./path-state.js";

it.effect("accounts for preimage hashing without changing independent file observations", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped();
    const target = path.join(root, "private.json");
    yield* fs.writeFileString(target, "abc");
    let reads = 0;
    const counted: FileSystem.FileSystem = {
      ...fs,
      readFile: (...args) => {
        reads += 1;
        return fs.readFile(...args);
      },
    };
    const spans: Tracer.NativeSpan[] = [];
    const tracer = Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options);
        spans.push(span);
        return span;
      },
    });
    const state = yield* observePathState(counted, path, target).pipe(withDetailedWork(tracer));
    expect(state.get("")).toMatch(
      /:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad$/,
    );
    expect(reads).toBe(1);
    const hashes = spans.filter((span) => span.name === "axm.hash.preimage");
    expect(hashes).toHaveLength(1);
    expect(hashes[0]?.attributes.get("axm.work.bytes")).toBe(3);
    expect(hashes[0]?.attributes.get("axm.work.count")).toBe(1);
    expect(JSON.stringify(hashes.map((span) => [...span.attributes]))).not.toContain(target);
  }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
);

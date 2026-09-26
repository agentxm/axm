import * as Effect from "effect/Effect";
import { it } from "@effect/vitest";
import { expect } from "vitest";

import { makeMemoryFileSystem } from "./memory-file-system.js";
import { snapshotPath, snapshotTree } from "./tree-snapshot.js";

it.effect("records byte-exact files, empty directories, and links in stable path order", () =>
  Effect.gen(function* () {
    const memory = makeMemoryFileSystem();
    memory.files.makeDirectory("/tmp/world/nested");
    memory.files.writeFile("/tmp/world/nested/binary", Uint8Array.from([0, 255, 10]));
    yield* memory.fileSystem.symlink("missing", "/tmp/world/link");

    const snapshot = snapshotTree("/tmp/world", memory.files);
    expect(snapshot).toEqual({
      link: "symlink:missing",
      nested: "directory",
      "nested/binary": "file:AP8K",
    });
    expect(Object.keys(snapshot)).toEqual(["link", "nested", "nested/binary"]);
    expect(snapshotPath("/tmp/world/link", memory.files)).toEqual({ ".": "symlink:missing" });
    expect(snapshotPath("/tmp/world/nested", memory.files)).toEqual({ binary: "file:AP8K" });
    expect(snapshotPath("/tmp/world/missing", memory.files)).toEqual({});
    expect(snapshotTree("/tmp/world/missing", memory.files)).toEqual({});
  }),
);

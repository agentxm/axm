import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { makeMemoryFileSystem } from "./memory-file-system.js";
import { makeNativeFileStore } from "./native-file-store.js";

for (const mode of ["disk", "memory"] as const) {
  describe(`filesystem contract (${mode})`, () => {
    it.effect("observes directories and links without hiding invalid observation requests", () =>
      Effect.gen(function* () {
        const memory = makeMemoryFileSystem();
        const fs =
          mode === "memory"
            ? memory.fileSystem
            : yield* FileSystem.FileSystem.pipe(Effect.provide(NodeFileSystem.layer));
        const files = mode === "memory" ? memory.files : makeNativeFileStore();
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-store-contract-" });
        yield* fs.makeDirectory(`${root}/directory`);
        yield* fs.writeFileString(`${root}/file`, "content");
        yield* fs.symlink("file", `${root}/link`);

        expect((yield* fs.readDirectory(root)).sort()).toEqual(["directory", "file", "link"]);
        expect((yield* fs.stat(`${root}/directory`)).type).toBe("Directory");
        expect(files.type(`${root}/directory`)).toBe("directory");
        expect(files.type(`${root}/file`)).toBe("file");
        expect(files.type(`${root}/link`)).toBe("symlink");
        expect(files.type(`${root}/absent`)).toBeUndefined();
        expect(() => files.type("invalid\0path")).toThrow();
        expect(memory.failures).toEqual([]);
      }),
    );

    it.effect("preserves byte, link, rename, deletion, and overwrite semantics", () =>
      Effect.gen(function* () {
        const memory = makeMemoryFileSystem();
        const fs =
          mode === "memory"
            ? memory.fileSystem
            : yield* FileSystem.FileSystem.pipe(Effect.provide(NodeFileSystem.layer));
        yield* Effect.addFinalizer(() => Effect.sync(() => expect(memory.failures).toEqual([])));
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-adapter-contract-" });
        const bytes = new Uint8Array([0, 255, 13, 10, 128]);

        yield* fs.writeFile(`${root}/source`, bytes);
        yield* fs.symlink("source", `${root}/link`);
        expect(yield* fs.readLink(`${root}/link`)).toBe("source");
        expect((yield* fs.stat(`${root}/link`)).type).toBe("File");
        expect((yield* fs.stat(`${root}/source`)).size).toBe(5n);

        yield* fs.copyFile(`${root}/source`, `${root}/replacement`);
        yield* fs.rename(`${root}/replacement`, `${root}/source`);
        expect(Array.from(yield* fs.readFile(`${root}/link`))).toEqual(Array.from(bytes));

        yield* fs.writeFileString(`${root}/destination`, "retained");
        yield* fs.copy(`${root}/source`, `${root}/destination`);
        expect(yield* fs.readFileString(`${root}/destination`)).toBe("retained");
        yield* fs.copy(`${root}/source`, `${root}/destination`, { overwrite: true });
        expect(Array.from(yield* fs.readFile(`${root}/destination`))).toEqual(Array.from(bytes));

        yield* fs.remove(`${root}/link`);
        expect(yield* fs.exists(`${root}/source`)).toBe(true);
        expect((yield* fs.readFile(`${root}/missing`).pipe(Effect.result))._tag).toBe("Failure");
      }),
    );
  });
}

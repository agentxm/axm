import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { copyExtensionDirectory } from "./copy-directory.js";

describe("copyExtensionDirectory pre-write identity checks", () => {
  let tmpDir: string;
  let src: string;
  let dest: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "copy-identities-")));
    src = path.join(tmpDir, "src");
    dest = path.join(tmpDir, "dest");
    fs.mkdirSync(src);
    fs.writeFileSync(path.join(src, "a.txt"), "alpha");
    fs.writeFileSync(path.join(src, "b.txt"), "bravo");
    fs.chmodSync(path.join(src, "b.txt"), 0o755);
    fs.symlinkSync("a.txt", path.join(src, "l"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it.effect("resolves the source root and each destination once before writing", () =>
    Effect.gen(function* () {
      const { fileSystem, recording } = makeRecordingFileSystem(yield* FileSystem.FileSystem);
      recording.reset();
      yield* copyExtensionDirectory(src, dest).pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
      );

      const count = (target: string, method: "readLink" | "stat") =>
        recording.calls({ path: target, method }).length;
      expect({
        // The source root is resolved once, by the overlap check against the destination.
        sourceRootReadLink: count(src, "readLink"),
        // Each file target is resolved once; the sink opens it rather than stats it.
        targetAStat: count(path.join(dest, "a.txt"), "stat"),
        targetBStat: count(path.join(dest, "b.txt"), "stat"),
        // Each source file: the scan's stat and one identity resolution.
        sourceAStat: count(path.join(src, "a.txt"), "stat"),
        sourceBStat: count(path.join(src, "b.txt"), "stat"),
        linkTargetStat: count(path.join(dest, "l"), "stat"),
      }).toEqual({
        sourceRootReadLink: 1,
        targetAStat: 1,
        targetBStat: 1,
        sourceAStat: 2,
        sourceBStat: 2,
        linkTargetStat: 1,
      });

      expect(fs.readFileSync(path.join(dest, "a.txt"), "utf8")).toBe("alpha");
      expect(fs.readFileSync(path.join(dest, "b.txt"), "utf8")).toBe("bravo");
      expect(fs.statSync(path.join(dest, "b.txt")).mode & 0o777).toBe(0o755);
      expect(fs.readlinkSync(path.join(dest, "l"))).toBe("a.txt");
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

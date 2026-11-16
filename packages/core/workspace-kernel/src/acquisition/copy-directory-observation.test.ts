import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { makeRecordingFileSystem, type FileSystemRecording } from "@agentxm/test-support";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { copyExtensionDirectory, observeCopySource } from "./copy-directory.js";

/** A recursive walk of `root` with each entry's link value, as a caller takes one. */
const walk = (root: string) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const entries = yield* fileSystem.readDirectory(root, { recursive: true });
    const listing = yield* Effect.forEach(entries, (relativePath) =>
      fileSystem.readLink(path.join(root, relativePath)).pipe(
        Effect.option,
        Effect.map((link) => [relativePath, link] as const),
      ),
    );
    return yield* observeCopySource(root, listing);
  });

/** Physical calls naming `root` or a path inside it, as "method relative-path" counts. */
const sourceCalls = (recording: FileSystemRecording, root: string) => {
  const counts = new Map<string, number>();
  for (const call of recording.calls()) {
    if (call.path !== root && !call.path.startsWith(root + path.sep)) continue;
    const key = `${call.method} ${path.relative(root, call.path)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

/** Calls `from` makes more often than `than`, with how many more. */
const surplus = (from: Map<string, number>, than: Map<string, number>) =>
  [...from].flatMap(([key, count]) => {
    const extra = count - (than.get(key) ?? 0);
    return extra > 0 ? [`${key} x${extra}`] : [];
  });

/** Every entry under `root`, with its kind and its link value or file content. */
const snapshot = (root: string): Array<string> =>
  [...fs.readdirSync(root, { recursive: true, encoding: "utf8" })].sort().map((relative) => {
    const entry = path.join(root, relative);
    const info = fs.lstatSync(entry);
    if (info.isSymbolicLink()) return `${relative} -> ${fs.readlinkSync(entry)}`;
    if (info.isDirectory()) return `${relative}/`;
    return `${relative}: ${fs.readFileSync(entry, "utf8")}`;
  });

describe("copyExtensionDirectory with a walk of its source", () => {
  let tmpDir: string;
  let src: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "copy-observed-")));
    src = path.join(tmpDir, "src");
    for (const [relative, content] of [
      ["SKILL.md", "# Skill"],
      ["README.md", "readme"],
      ["_private.md", "private"],
      ["nested/a.md", "a"],
      [".git/HEAD", "ref"],
    ] as const) {
      fs.mkdirSync(path.dirname(path.join(src, relative)), { recursive: true });
      fs.writeFileSync(path.join(src, relative), content);
    }
    fs.mkdirSync(path.join(src, "empty"));
    fs.symlinkSync("SKILL.md", path.join(src, "alias.md"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const recordedCopy = (dest: string, observeFrom: string | undefined) =>
    Effect.gen(function* () {
      const { fileSystem, recording } = makeRecordingFileSystem(yield* FileSystem.FileSystem);
      const sourceObservation = observeFrom === undefined ? undefined : yield* walk(observeFrom);
      recording.reset();
      yield* copyExtensionDirectory(src, dest, {
        forAgentArtifact: true,
        ...(sourceObservation === undefined ? {} : { sourceObservation }),
      }).pipe(Effect.provideService(FileSystem.FileSystem, fileSystem));
      return sourceCalls(recording, src);
    }).pipe(Effect.provide(NodeServices.layer));

  it.effect(
    "takes the scan's listings and link values from the walk and copies the same tree",
    () =>
      Effect.gen(function* () {
        const live = yield* recordedCopy(path.join(tmpDir, "live"), undefined);
        const observed = yield* recordedCopy(path.join(tmpDir, "observed"), src);

        expect(snapshot(path.join(tmpDir, "observed"))).toEqual(
          snapshot(path.join(tmpDir, "live")),
        );
        expect(snapshot(path.join(tmpDir, "observed"))).toEqual([
          "SKILL.md: # Skill",
          "alias.md -> SKILL.md",
          "empty/",
          "nested/",
          "nested/a.md: a",
        ]);
        // Only the scan's own listing of each copied directory and link read of
        // each visited entry are gone; every other read stays live.
        expect(surplus(live, observed).sort()).toEqual([
          "readDirectory  x1",
          "readDirectory empty x1",
          "readDirectory nested x1",
          "readLink SKILL.md x1",
          "readLink alias.md x1",
          "readLink empty x1",
          "readLink nested x1",
          "readLink nested/a.md x1",
        ]);
        expect(surplus(observed, live)).toEqual([]);
      }),
  );

  it.effect("scans live when the walk belongs to another source", () =>
    Effect.gen(function* () {
      const other = path.join(tmpDir, "other");
      fs.cpSync(src, other, { recursive: true, verbatimSymlinks: true });

      const live = yield* recordedCopy(path.join(tmpDir, "live"), undefined);
      const observed = yield* recordedCopy(path.join(tmpDir, "observed"), other);

      expect([...observed]).toEqual([...live]);
      expect(snapshot(path.join(tmpDir, "observed"))).toEqual(snapshot(path.join(tmpDir, "live")));
    }),
  );
});

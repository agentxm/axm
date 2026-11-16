/**
 * A distribution-tree digest of a tree a strict integrity walk has just
 * walked replays that walk: its listings in their listing order, its link
 * targets, entry types, modes and file bytes. Its digest and its first
 * refusal are those of a live walk, and Git administration bytes are never
 * kept.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { computeMaterializedTreeIntegrityWalking } from "../workspace-state/index.js";
import {
  computeDistributionTreeIntegrity,
  resolveFileSelection,
  type ResolvedFileSelection,
} from "./index.js";

const writeTree = Effect.fn(function* (root: string, linked: boolean) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  for (const directory of ["src/deep", "empty", ".git", "drafts"])
    yield* fs.makeDirectory(path.join(root, directory), { recursive: true });
  yield* fs.writeFileString(path.join(root, "skill.json"), "{}");
  yield* fs.writeFileString(path.join(root, "src", "SKILL.md"), "# Review\n");
  yield* fs.writeFileString(path.join(root, "src", "deep", "run.sh"), "#!/bin/sh\n");
  yield* fs.chmod(path.join(root, "src", "deep", "run.sh"), 0o755);
  yield* fs.writeFileString(path.join(root, ".git", "config"), "administration");
  yield* fs.writeFileString(path.join(root, "drafts", "note.md"), "unpublished");
  if (linked) yield* fs.symlink("SKILL.md", path.join(root, "src", "guide.md"));
});

/** The live digest, then the digest replaying a strict walk of the same root, recorded. */
const digests = (root: string, selection?: ResolvedFileSelection) =>
  Effect.gen(function* () {
    const live = yield* Effect.result(computeDistributionTreeIntegrity(root, selection));
    const walked = yield* computeMaterializedTreeIntegrityWalking(root);
    const walk = Option.getOrUndefined(walked.walk);
    if (walk === undefined) return yield* Effect.die("Expected a captured walk");
    const { fileSystem, recording } = makeRecordingFileSystem(yield* FileSystem.FileSystem);
    const replayed = yield* Effect.result(
      computeDistributionTreeIntegrity(root, selection, undefined, walk),
    ).pipe(Effect.provideService(FileSystem.FileSystem, fileSystem));
    return { live, replayed, recording, walk };
  });

describe("distribution digest of a strict walk", () => {
  it.effect("digests the same tree without observing it again", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* writeTree(root, false);
      const { live, replayed, recording, walk } = yield* digests(root);
      expect(live._tag).toBe("Success");
      expect(replayed).toEqual(live);
      expect(recording.calls()).toEqual([]);
      expect(walk.bytes(".git/config")).toBeUndefined();
      expect(Array.from(walk.bytes("skill.json") ?? [])).toEqual(Array.from(Buffer.from("{}")));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("digests a tree with a contained link as a live walk does", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* writeTree(root, true);
      const { live, replayed } = yield* digests(root);
      expect(live._tag).toBe("Success");
      expect(replayed).toEqual(live);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses the same first retained link to excluded content", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* writeTree(root, true);
      yield* fs.symlink("../drafts/note.md", path.join(root, "src", "draft.md"));
      yield* fs.symlink("drafts", path.join(root, "notes"));
      const selection = resolveFileSelection({
        packageDirectory: "",
        gitignore: [],
        exclude: ["drafts/"],
        manifest: "skill.json",
      });
      const { live, replayed } = yield* digests(root, selection);
      expect(live._tag).toBe("Failure");
      expect(replayed).toEqual(live);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("hands out a copy of the bytes it read", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* writeTree(root, false);
      const { walk } = yield* digests(root);
      walk.bytes("skill.json")?.fill(0);
      expect(Array.from(walk.bytes("skill.json") ?? [])).toEqual(Array.from(Buffer.from("{}")));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

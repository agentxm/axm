/**
 * A distribution-tree hash of the package root an ignore observation just
 * walked replays that walk's listings, link targets, entry types and modes
 * instead of observing them again. Its digest and its first refusal are
 * those of a live walk; file reads and contained-link validation stay live.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import {
  computeDistributionTreeIntegrity,
  resolveFileSelection,
  type ResolvedFileSelection,
} from "../../acquisition/index.js";
import { observeGitIgnoreInputs } from "../index.js";

/** The live digest, then the digest replaying the ignore observation's listing, recorded. */
const digests = (root: string, selection?: ResolvedFileSelection) =>
  Effect.gen(function* () {
    const live = yield* Effect.result(computeDistributionTreeIntegrity(root, selection));
    const { fileSystem, recording } = makeRecordingFileSystem(yield* FileSystem.FileSystem);
    const replayed = yield* Effect.gen(function* () {
      const snapshot = yield* observeGitIgnoreInputs({
        packageRoot: root,
        boundaryRoot: root,
        retainListing: true,
      });
      recording.reset();
      return yield* Effect.result(
        computeDistributionTreeIntegrity(root, selection, undefined, snapshot.listing),
      );
    }).pipe(Effect.provideService(FileSystem.FileSystem, fileSystem));
    return { live, replayed, recording };
  });

const writeTree = Effect.fn(function* (root: string, linked = true) {
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

describe("distribution hash over an ignore observation's listing", () => {
  it.effect("digests the same tree with links as a live walk", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* writeTree(root);
      const { live, replayed } = yield* digests(root);
      expect(live._tag).toBe("Success");
      expect(replayed).toEqual(live);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("digests the same tree without listing, probing or stating it again", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* writeTree(root, false);
      const { live, replayed, recording } = yield* digests(root);
      expect(live._tag).toBe("Success");
      expect(replayed).toEqual(live);
      const observed = recording.calls().map((call) => call.method);
      expect(observed.filter((method) => method === "readDirectory")).toHaveLength(0);
      expect(observed.filter((method) => method === "readLink")).toHaveLength(0);
      expect(observed.filter((method) => method === "stat")).toHaveLength(0);
      // Every file outside Git administration is still read.
      expect(observed.filter((method) => method === "readFile")).toHaveLength(4);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses the same first retained link to excluded content", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* writeTree(root);
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

  it.effect("observes live any directory the listing does not hold", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* writeTree(root);
      const live = yield* computeDistributionTreeIntegrity(root);
      const snapshot = yield* observeGitIgnoreInputs({
        packageRoot: root,
        boundaryRoot: root,
        retainListing: true,
      });
      const listing = snapshot.listing;
      if (listing === undefined) return yield* Effect.die("Expected a retained listing");
      const src = path.join("src");
      const partial = {
        names: (directory: string) => (directory === src ? undefined : listing.names(directory)),
        facts: (directory: string, name: string) =>
          directory === src ? undefined : listing.facts(directory, name),
      };
      expect(yield* computeDistributionTreeIntegrity(root, undefined, undefined, partial)).toBe(
        live,
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

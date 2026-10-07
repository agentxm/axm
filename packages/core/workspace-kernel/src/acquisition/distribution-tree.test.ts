import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { computeDistributionTreeIntegrity, resolveFileSelection } from "./index.js";

describe("selected distribution identity", () => {
  it.effect("refuses a retained link to omitted Git administration", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.makeDirectory(path.join(root, ".git"));
      yield* fs.writeFileString(path.join(root, ".git", "config"), "administration");
      yield* fs.symlink(".git/config", path.join(root, "link"));
      const failure = yield* computeDistributionTreeIntegrity(root).pipe(Effect.flip);
      expect(failure.detail).toContain('points to excluded content ".git"');
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses selected links to omitted files or wholly omitted directories", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.makeDirectory(path.join(root, "drafts"));
      yield* fs.writeFileString(path.join(root, "drafts", "note.md"), "unpublished");
      yield* fs.symlink("drafts", path.join(root, "link"));
      const selection = resolveFileSelection({
        packageDirectory: "",
        gitignore: [],
        exclude: ["drafts/"],
        manifest: "skill.json",
      });
      const failure = yield* computeDistributionTreeIntegrity(root, selection).pipe(Effect.flip);
      expect(failure.detail).toContain('points to excluded content "drafts"');
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "drops excluded directories and preserves implied parents and retained empty directories",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, "source");
        const registry = path.join(root, "registry");
        for (const directory of [
          path.join(source, "evals"),
          path.join(source, "src", "deep"),
          path.join(source, "empty"),
          path.join(registry, "src", "deep"),
          path.join(registry, "empty"),
        ])
          yield* fs.makeDirectory(directory, { recursive: true });
        yield* fs.writeFileString(path.join(source, "evals", "case.json"), "{}");
        for (const directory of [source, registry]) {
          yield* fs.writeFileString(path.join(directory, "src", "deep", "body.md"), "content");
          yield* fs.writeFileString(path.join(directory, "skill.json"), "{}");
        }
        const selection = resolveFileSelection({
          packageDirectory: "",
          gitignore: [],
          exclude: ["evals/"],
          manifest: "skill.json",
        });
        const expected = yield* computeDistributionTreeIntegrity(registry);
        expect(yield* computeDistributionTreeIntegrity(source, selection)).toBe(expected);
        yield* fs.remove(path.join(registry, "empty"), { recursive: true });
        expect(yield* computeDistributionTreeIntegrity(registry)).not.toBe(expected);
        yield* fs.makeDirectory(path.join(registry, "empty"));
        yield* fs.chmod(path.join(registry, "src", "deep", "body.md"), 0o755);
        expect(yield* computeDistributionTreeIntegrity(registry)).not.toBe(expected);
      }).pipe(Effect.provide(NodeServices.layer)),
  );
});

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { makeRecordingFileSystem, type FileSystemRecording } from "@agentxm/test-support";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Result from "effect/Result";
import { DirectoryCopyLimitExceeded } from "@agentxm/workspace-kernel/acquisition";
import { NativeLocationError } from "@agentxm/workspace-kernel/locations";

import { ForkPackageFailed, ForkPackageInvalid } from "./authored-package-errors.js";
import { extensionName, handle } from "./test-helpers.js";
import { forkExtensionPackage, type ForkExtensionPackageArgs } from "./fork-package.js";

const readJson = (filePath: string): unknown => JSON.parse(fs.readFileSync(filePath, "utf8"));

const skillManifest = `${JSON.stringify({
  owner: "@source",
  type: "skill",
  name: "review",
  version: "4.2.0",
})}\n`;

const skillFork = (sourceDir: string, targetDir: string): ForkExtensionPackageArgs => ({
  sourceDir,
  targetDir,
  sourceIdentity: {
    owner: handle("@source"),
    type: "skill",
    name: extensionName("review"),
    version: "4.2.0",
  },
  target: { owner: handle("@target"), type: "skill", name: extensionName("review-plus") },
});

/** Run one fork over the real filesystem, recording only the fork's own calls. */
const recordedFork = (args: ForkExtensionPackageArgs) =>
  Effect.gen(function* () {
    const { fileSystem, recording } = makeRecordingFileSystem(yield* FileSystem.FileSystem);
    recording.reset();
    const result = yield* Effect.result(
      forkExtensionPackage(args).pipe(Effect.provideService(FileSystem.FileSystem, fileSystem)),
    );
    return { result, recording };
  }).pipe(Effect.provide(NodeServices.layer));

const failureOf = <A, E>(result: Result.Result<A, E>): E | undefined =>
  Result.isFailure(result) ? result.failure : undefined;

describe("forkExtensionPackage", () => {
  let tempDir: string;
  let sourceDir: string;
  let targetDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-fork-package-"));
    sourceDir = path.join(tempDir, "source");
    targetDir = path.join(tempDir, "target");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const write = (relative: string, content: string): void => {
    const target = path.join(sourceDir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };

  it.effect("rewrites skill package identity and preserves content metadata", () =>
    Effect.gen(function* () {
      fs.mkdirSync(path.join(sourceDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(sourceDir, "skill.json"),
        `${JSON.stringify({
          owner: "@source",
          type: "skill",
          name: "review",
          version: "4.2.0",
          license: "MIT",
          dependencies: { "@source/skills/helper": "^1.0.0" },
        })}\n`,
      );
      fs.writeFileSync(
        path.join(sourceDir, "src", "SKILL.md"),
        "---\nname: review\ndescription: Review code\n---\n\n# Review\n",
      );

      yield* forkExtensionPackage({
        sourceDir,
        targetDir,
        sourceIdentity: {
          owner: handle("@source"),
          type: "skill",
          name: extensionName("review"),
          version: "4.2.0",
        },
        target: {
          owner: handle("@target"),
          type: "skill",
          name: extensionName("review-plus"),
        },
      }).pipe(Effect.provide(NodeServices.layer));

      expect(readJson(path.join(targetDir, "skill.json"))).toMatchObject({
        owner: "@target",
        type: "skill",
        name: "review-plus",
        version: "0.1.0",
        license: "MIT",
        dependencies: { "@source/skills/helper": "^1.0.0" },
      });
      expect(fs.readFileSync(path.join(targetDir, "src", "SKILL.md"), "utf8")).toContain(
        "name: review",
      );
    }),
  );

  describe("source tree walks", () => {
    const sourceTreeCalls = (
      recording: FileSystemRecording,
      method: "readDirectory" | "readLink",
    ) =>
      recording
        .calls({ method })
        .filter(
          ({ path: called }) => called === sourceDir || called.startsWith(sourceDir + path.sep),
        )
        .map(({ path: called }) => path.relative(sourceDir, called));

    it.effect("copies from the listings and link reads of the containment walk", () =>
      Effect.gen(function* () {
        write("skill.json", skillManifest);
        write("src/SKILL.md", "# Review\n");
        write("src/nested/a.md", "a\n");
        const entries = ["skill.json", "src", "src/SKILL.md", "src/nested", "src/nested/a.md"];

        const { result, recording } = yield* recordedFork(skillFork(sourceDir, targetDir));

        expect(Result.isSuccess(result)).toBe(true);
        const listed = sourceTreeCalls(recording, "readDirectory");
        // The root's count includes the containment walk's one recursive
        // listing; the copy lists no directory again. The remaining listings
        // are the overlap checks' native path resolution, which stays live.
        expect(
          Object.fromEntries(
            ["", "src", "src/nested"].map((directory) => [
              directory,
              listed.filter((relative) => relative === directory).length,
            ]),
          ),
        ).toEqual({ "": 4, src: 2, "src/nested": 1 });
        const linkReads = sourceTreeCalls(recording, "readLink");
        // The containment walk reads every entry's link once and the copy
        // reads none again; each file's further read is the copy's one live
        // identity resolution, which its overlap checks share.
        expect(
          Object.fromEntries(
            entries.map((entry) => [entry, linkReads.filter((read) => read === entry).length]),
          ),
        ).toEqual({
          "skill.json": 2,
          src: 1,
          "src/SKILL.md": 2,
          "src/nested": 1,
          "src/nested/a.md": 2,
        });
        expect(fs.readFileSync(path.join(targetDir, "src", "nested", "a.md"), "utf8")).toBe("a\n");
      }),
    );

    it.effect("keeps an empty directory without listing it again", () =>
      Effect.gen(function* () {
        write("skill.json", skillManifest);
        fs.mkdirSync(path.join(sourceDir, "src", "empty"), { recursive: true });

        const { result, recording } = yield* recordedFork(skillFork(sourceDir, targetDir));

        expect(Result.isSuccess(result)).toBe(true);
        expect(fs.readdirSync(path.join(targetDir, "src", "empty"))).toEqual([]);
        expect(
          sourceTreeCalls(recording, "readDirectory").filter(
            (relative) => relative === "src/empty",
          ),
        ).toEqual([]);
      }),
    );
  });

  describe("source links", () => {
    it.effect("keeps a contained relative file link and a linked directory as links", () =>
      Effect.gen(function* () {
        write("skill.json", skillManifest);
        write("src/SKILL.md", "# Review\n");
        write("src/real/a.md", "a\n");
        fs.symlinkSync("SKILL.md", path.join(sourceDir, "src", "alias.md"));
        fs.symlinkSync("real", path.join(sourceDir, "src", "linked"), "dir");

        yield* forkExtensionPackage(skillFork(sourceDir, targetDir)).pipe(
          Effect.provide(NodeServices.layer),
        );

        expect(fs.readlinkSync(path.join(targetDir, "src", "alias.md"))).toBe("SKILL.md");
        expect(fs.readlinkSync(path.join(targetDir, "src", "linked"))).toBe("real");
        expect(fs.lstatSync(path.join(targetDir, "src", "linked")).isSymbolicLink()).toBe(true);
        expect(fs.readFileSync(path.join(targetDir, "src", "real", "a.md"), "utf8")).toBe("a\n");
      }),
    );

    it.effect("refuses a link that escapes the package root", () =>
      Effect.gen(function* () {
        write("skill.json", skillManifest);
        fs.writeFileSync(path.join(tempDir, "outside.md"), "outside\n");
        fs.mkdirSync(path.join(sourceDir, "src"));
        fs.symlinkSync("../../outside.md", path.join(sourceDir, "src", "outside.md"));

        const { result } = yield* recordedFork(skillFork(sourceDir, targetDir));

        const failure = failureOf(result);
        expect(failure).toBeInstanceOf(ForkPackageInvalid);
        expect(failure instanceof ForkPackageInvalid ? failure.detail : "").toBe(
          `Fork source symlink escapes the package root: ${path.join(sourceDir, "src", "outside.md")}`,
        );
        expect(fs.existsSync(targetDir)).toBe(false);
      }),
    );

    it.effect("refuses a dangling link", () =>
      Effect.gen(function* () {
        write("skill.json", skillManifest);
        fs.mkdirSync(path.join(sourceDir, "src"));
        fs.symlinkSync("missing.md", path.join(sourceDir, "src", "dangling.md"));

        const { result } = yield* recordedFork(skillFork(sourceDir, targetDir));

        const failure = failureOf(result);
        expect(failure).toBeInstanceOf(ForkPackageInvalid);
        expect(failure instanceof ForkPackageInvalid ? failure.detail : "").toBe(
          `Fork source contains an unresolved symlink: ${path.join(sourceDir, "src", "dangling.md")}`,
        );
        expect(fs.existsSync(targetDir)).toBe(false);
      }),
    );

    it.effect("refuses an escaping link inside version-control state", () =>
      Effect.gen(function* () {
        write("skill.json", skillManifest);
        write(".git/HEAD", "ref: refs/heads/main\n");
        fs.writeFileSync(path.join(tempDir, "outside"), "outside\n");
        fs.symlinkSync("../../outside", path.join(sourceDir, ".git", "escape"));

        const { result } = yield* recordedFork(skillFork(sourceDir, targetDir));

        const failure = failureOf(result);
        expect(failure).toBeInstanceOf(ForkPackageInvalid);
        expect(failure instanceof ForkPackageInvalid ? failure.detail : "").toBe(
          `Fork source symlink escapes the package root: ${path.join(sourceDir, ".git", "escape")}`,
        );
      }),
    );

    it.effect("fails the copy of a contained absolute link as a non-relocatable escape", () =>
      Effect.gen(function* () {
        write("skill.json", skillManifest);
        write("src/SKILL.md", "# Review\n");
        fs.symlinkSync(
          path.join(sourceDir, "src", "SKILL.md"),
          path.join(sourceDir, "src", "absolute.md"),
        );

        const { result } = yield* recordedFork(skillFork(sourceDir, targetDir));

        const failure = failureOf(result);
        expect(failure).toBeInstanceOf(ForkPackageFailed);
        const cause = failure instanceof ForkPackageFailed ? failure.cause : undefined;
        expect(cause).toBeInstanceOf(NativeLocationError);
        expect(cause instanceof NativeLocationError ? [cause.reason, cause.target] : []).toEqual([
          "escape",
          path.join(sourceDir, "src", "absolute.md"),
        ]);
      }),
    );
  });

  it.effect("refuses a source tree with more entries than a copy allows", () =>
    Effect.gen(function* () {
      write("skill.json", skillManifest);
      const many = path.join(sourceDir, "many");
      fs.mkdirSync(many);
      for (let index = 0; index < 10_000; index += 1) {
        fs.writeFileSync(path.join(many, `${index}.md`), "");
      }

      const { result } = yield* recordedFork(skillFork(sourceDir, targetDir));

      const failure = failureOf(result);
      expect(failure).toBeInstanceOf(ForkPackageFailed);
      const cause = failure instanceof ForkPackageFailed ? failure.cause : undefined;
      expect(cause).toBeInstanceOf(DirectoryCopyLimitExceeded);
      expect(cause instanceof DirectoryCopyLimitExceeded ? cause.resource : "").toBe("entries");
      expect(fs.existsSync(targetDir)).toBe(false);
    }),
  );
});

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import { afterEach, beforeEach } from "vitest";
import { copySkillDirectory } from "./copy-directory.js";

const withPlatform = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
) => effect.pipe(Effect.provide(NodeServices.layer));

describe("copySkillDirectory", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "copy-skill-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it.effect("copies regular files to destination", () =>
    withPlatform(
      Effect.gen(function* () {
        const src = path.join(tmpDir, "src");
        const dest = path.join(tmpDir, "dest");
        fs.mkdirSync(src);
        fs.writeFileSync(path.join(src, "SKILL.md"), "# My Skill");
        fs.writeFileSync(path.join(src, "prompt.md"), "prompt content");

        yield* copySkillDirectory(src, dest);

        expect(fs.readFileSync(path.join(dest, "SKILL.md"), "utf-8")).toBe("# My Skill");
        expect(fs.readFileSync(path.join(dest, "prompt.md"), "utf-8")).toBe("prompt content");
      }),
    ),
  );

  it.effect("excludes README.md", () =>
    withPlatform(
      Effect.gen(function* () {
        const src = path.join(tmpDir, "src");
        const dest = path.join(tmpDir, "dest");
        fs.mkdirSync(src);
        fs.writeFileSync(path.join(src, "SKILL.md"), "content");
        fs.writeFileSync(path.join(src, "README.md"), "readme");

        yield* copySkillDirectory(src, dest);

        expect(fs.existsSync(path.join(dest, "SKILL.md"))).toBe(true);
        expect(fs.existsSync(path.join(dest, "README.md"))).toBe(false);
      }),
    ),
  );

  it.effect("excludes metadata.json", () =>
    withPlatform(
      Effect.gen(function* () {
        const src = path.join(tmpDir, "src");
        const dest = path.join(tmpDir, "dest");
        fs.mkdirSync(src);
        fs.writeFileSync(path.join(src, "SKILL.md"), "content");
        fs.writeFileSync(path.join(src, "metadata.json"), "{}");

        yield* copySkillDirectory(src, dest);

        expect(fs.existsSync(path.join(dest, "metadata.json"))).toBe(false);
      }),
    ),
  );

  it.effect("excludes _-prefixed entries", () =>
    withPlatform(
      Effect.gen(function* () {
        const src = path.join(tmpDir, "src");
        const dest = path.join(tmpDir, "dest");
        fs.mkdirSync(src);
        fs.writeFileSync(path.join(src, "SKILL.md"), "content");
        fs.mkdirSync(path.join(src, "_private"));
        fs.writeFileSync(path.join(src, "_private", "secret.txt"), "secret");
        fs.writeFileSync(path.join(src, "_hidden.txt"), "hidden");

        yield* copySkillDirectory(src, dest);

        expect(fs.existsSync(path.join(dest, "_private"))).toBe(false);
        expect(fs.existsSync(path.join(dest, "_hidden.txt"))).toBe(false);
      }),
    ),
  );

  it.effect("excludes .git directory", () =>
    withPlatform(
      Effect.gen(function* () {
        const src = path.join(tmpDir, "src");
        const dest = path.join(tmpDir, "dest");
        fs.mkdirSync(src);
        fs.writeFileSync(path.join(src, "SKILL.md"), "content");
        fs.mkdirSync(path.join(src, ".git"));
        fs.writeFileSync(path.join(src, ".git", "HEAD"), "ref");

        yield* copySkillDirectory(src, dest);

        expect(fs.existsSync(path.join(dest, ".git"))).toBe(false);
      }),
    ),
  );

  it.effect("copies nested directories recursively", () =>
    withPlatform(
      Effect.gen(function* () {
        const src = path.join(tmpDir, "src");
        const dest = path.join(tmpDir, "dest");
        fs.mkdirSync(src);
        fs.mkdirSync(path.join(src, "lib"));
        fs.writeFileSync(path.join(src, "lib", "helper.ts"), "export const x = 1;");
        fs.mkdirSync(path.join(src, "lib", "nested"));
        fs.writeFileSync(path.join(src, "lib", "nested", "deep.ts"), "deep");

        yield* copySkillDirectory(src, dest);

        expect(fs.readFileSync(path.join(dest, "lib", "helper.ts"), "utf-8")).toBe(
          "export const x = 1;",
        );
        expect(fs.readFileSync(path.join(dest, "lib", "nested", "deep.ts"), "utf-8")).toBe("deep");
      }),
    ),
  );

  it.effect("dereferences symlinks (copies content, not link)", () =>
    withPlatform(
      Effect.gen(function* () {
        const src = path.join(tmpDir, "src");
        const dest = path.join(tmpDir, "dest");
        const realFile = path.join(tmpDir, "real.txt");

        fs.mkdirSync(src);
        fs.writeFileSync(realFile, "real content");
        fs.symlinkSync(realFile, path.join(src, "linked.txt"));

        yield* copySkillDirectory(src, dest);

        const destFile = path.join(dest, "linked.txt");
        expect(fs.existsSync(destFile)).toBe(true);
        // Should be a regular file, not a symlink
        expect(fs.lstatSync(destFile).isSymbolicLink()).toBe(false);
        expect(fs.readFileSync(destFile, "utf-8")).toBe("real content");
      }),
    ),
  );

  it.effect("creates destination directory if it does not exist", () =>
    withPlatform(
      Effect.gen(function* () {
        const src = path.join(tmpDir, "src");
        const dest = path.join(tmpDir, "a", "b", "dest");
        fs.mkdirSync(src);
        fs.writeFileSync(path.join(src, "SKILL.md"), "content");

        yield* copySkillDirectory(src, dest);

        expect(fs.existsSync(dest)).toBe(true);
        expect(fs.readFileSync(path.join(dest, "SKILL.md"), "utf-8")).toBe("content");
      }),
    ),
  );
});

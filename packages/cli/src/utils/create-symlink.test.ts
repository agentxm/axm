import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import { afterEach, beforeEach } from "vitest";
import { createSymlink } from "./create-symlink.js";

const withNodeContext = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
) => effect.pipe(Effect.provide(NodeServices.layer));

describe("createSymlink", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "create-symlink-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it.effect("creates a new relative symlink", () =>
    withNodeContext(
      Effect.gen(function* () {
        const target = path.join(tmpDir, "target-dir");
        fs.mkdirSync(target);
        fs.writeFileSync(path.join(target, "hello.txt"), "content");

        const link = path.join(tmpDir, "sub", "link-dir");

        const result = yield* createSymlink({ target, link });
        expect(result).toBe("created");

        // Symlink should exist and be relative
        const linkTarget = fs.readlinkSync(link);
        expect(path.isAbsolute(linkTarget)).toBe(false);

        // Should resolve to the correct target
        const resolved = fs.realpathSync(link);
        expect(resolved).toBe(target);
      }),
    ),
  );

  it.effect("creates parent directories if they do not exist", () =>
    withNodeContext(
      Effect.gen(function* () {
        const target = path.join(tmpDir, "target");
        fs.mkdirSync(target);

        const link = path.join(tmpDir, "a", "b", "c", "link");

        yield* createSymlink({ target, link });

        expect(fs.existsSync(path.join(tmpDir, "a", "b", "c"))).toBe(true);
        expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
      }),
    ),
  );

  it.effect("returns no-op when existing symlink points to correct target", () =>
    withNodeContext(
      Effect.gen(function* () {
        const target = path.join(tmpDir, "target");
        fs.mkdirSync(target);

        const link = path.join(tmpDir, "link");
        const relTarget = path.relative(path.dirname(link), target);
        fs.symlinkSync(relTarget, link);

        const result = yield* createSymlink({ target, link });
        expect(result).toBe("no-op");
      }),
    ),
  );

  it.effect("replaces existing symlink pointing to wrong target", () =>
    withNodeContext(
      Effect.gen(function* () {
        const oldTarget = path.join(tmpDir, "old-target");
        fs.mkdirSync(oldTarget);
        const newTarget = path.join(tmpDir, "new-target");
        fs.mkdirSync(newTarget);

        const link = path.join(tmpDir, "link");
        fs.symlinkSync(path.relative(path.dirname(link), oldTarget), link);

        const result = yield* createSymlink({ target: newTarget, link });
        expect(result).toBe("replaced");

        const resolved = fs.realpathSync(link);
        expect(resolved).toBe(newTarget);
      }),
    ),
  );

  it.effect("replaces existing directory with symlink", () =>
    withNodeContext(
      Effect.gen(function* () {
        const target = path.join(tmpDir, "target");
        fs.mkdirSync(target);

        const link = path.join(tmpDir, "link");
        fs.mkdirSync(link);
        fs.writeFileSync(path.join(link, "old-file.txt"), "stale");

        const result = yield* createSymlink({ target, link });
        expect(result).toBe("replaced");

        expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
        const resolved = fs.realpathSync(link);
        expect(resolved).toBe(target);
      }),
    ),
  );

  it.effect("recovers from ELOOP (circular symlink)", () =>
    withNodeContext(
      Effect.gen(function* () {
        const target = path.join(tmpDir, "target");
        fs.mkdirSync(target);

        // Create a circular symlink: a -> b, b -> a
        const linkA = path.join(tmpDir, "link-a");
        const linkB = path.join(tmpDir, "link-b");
        fs.symlinkSync("link-b", linkA);
        fs.symlinkSync("link-a", linkB);

        // Now try to create a proper symlink at linkA
        const result = yield* createSymlink({ target, link: linkA });
        expect(result).toBe("replaced");

        const resolved = fs.realpathSync(linkA);
        expect(resolved).toBe(target);
      }),
    ),
  );

  it.effect("skips self-reference (link resolves to same location as target)", () =>
    withNodeContext(
      Effect.gen(function* () {
        const target = path.join(tmpDir, "skills", "my-skill");
        fs.mkdirSync(target, { recursive: true });

        // Link path that would resolve to the same place
        const result = yield* createSymlink({ target, link: target });
        expect(result).toBe("skipped");
      }),
    ),
  );

  it.effect("computes relative path through resolved parent symlinks", () =>
    withNodeContext(
      Effect.gen(function* () {
        // Create real directories
        const realSkillsDir = path.join(tmpDir, "real-skills");
        fs.mkdirSync(realSkillsDir);
        const target = path.join(realSkillsDir, "my-skill");
        fs.mkdirSync(target);

        // Create a symlink for the agent's skills dir
        const agentDir = path.join(tmpDir, "agent-skills");
        fs.symlinkSync(realSkillsDir, agentDir);

        const link = path.join(agentDir, "my-skill");

        const result = yield* createSymlink({ target, link });

        // Since agentDir is a symlink to realSkillsDir, the resolved paths
        // point to the same place — should detect self-reference
        expect(result).toBe("skipped");
      }),
    ),
  );
});

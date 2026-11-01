import type { NativeEntryRemoval } from "../../locations/index.js";
import { NativePlatformTest } from "../../locations/testing.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import { afterEach, beforeEach } from "vitest";
import { runWorkspaceTransaction } from "../../settlement/index.js";
import { WorkspaceTransactionScopeTest } from "../../settlement/testing.js";
import { createSymlink } from "./create-symlink.js";

const withNodeContext = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | NativeEntryRemoval>,
) => effect.pipe(Effect.provide(NativePlatformTest));

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

  it.effect.each(["parent creation", "link creation"] as const)(
    "restores the preimage when interrupted after native %s",
    (phase) =>
      withNodeContext(
        Effect.gen(function* () {
          const target = path.join(tmpDir, "target");
          const workspaceDir = path.join(tmpDir, ".axm");
          const parent = path.join(tmpDir, "links");
          const link = path.join(parent, "link");
          fs.mkdirSync(target);
          fs.mkdirSync(workspaceDir);
          fs.writeFileSync(path.join(target, "content.txt"), "retained source\n");
          const before = fs.readdirSync(tmpDir, { recursive: true }).sort();
          const published = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          const holdCompletion = Deferred.succeed(published, undefined).pipe(
            Effect.andThen(Deferred.await(release)),
          );
          const fileSystem = yield* FileSystem.FileSystem;
          const controlled: FileSystem.FileSystem = {
            ...fileSystem,
            makeDirectory: (directory, options) =>
              fileSystem
                .makeDirectory(directory, options)
                .pipe(
                  Effect.andThen(
                    phase === "parent creation" && directory === parent
                      ? holdCompletion
                      : Effect.void,
                  ),
                ),
            symlink: (from, to) =>
              fileSystem
                .symlink(from, to)
                .pipe(
                  Effect.andThen(
                    phase === "link creation" && to === link ? holdCompletion : Effect.void,
                  ),
                ),
          };

          yield* Effect.gen(function* () {
            const transaction = yield* runWorkspaceTransaction({
              claimDefaultTargets: false,
              targets: [parent],
              transition: createSymlink({ target, link }),
              validate: () => Effect.void,
            }).pipe(
              Effect.provide(
                WorkspaceTransactionScopeTest({
                  workspaceDir,
                  settingsPath: path.join(tmpDir, "axm.json"),
                  lockPath: path.join(tmpDir, "axm.lock"),
                }),
              ),
              Effect.provideService(FileSystem.FileSystem, controlled),
              Effect.forkChild,
            );
            yield* Deferred.await(published);
            expect(fs.statSync(parent).isDirectory()).toBe(true);
            if (phase === "link creation") {
              expect(fs.readlinkSync(link)).toBe(path.relative(parent, target));
            } else {
              expect(fs.existsSync(link)).toBe(false);
            }
            const interrupt = yield* Fiber.interrupt(transaction).pipe(
              Effect.forkChild({ startImmediately: true }),
            );
            yield* Deferred.succeed(release, undefined);
            yield* Fiber.join(interrupt);
            const exit = yield* Fiber.await(transaction);
            expect(Exit.isFailure(exit)).toBe(true);
            if (Exit.isFailure(exit)) {
              expect(Cause.hasInterruptsOnly(exit.cause), JSON.stringify(exit.cause)).toBe(true);
            }
            expect(fs.readdirSync(tmpDir, { recursive: true }).sort()).toEqual(before);
            expect(fs.readFileSync(path.join(target, "content.txt"), "utf8")).toBe(
              "retained source\n",
            );
          }).pipe(Effect.ensuring(Deferred.succeed(release, undefined)));
        }).pipe(Effect.scoped),
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

  it.effect("refuses an unreadable circular symlink without replacing either entry", () =>
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
        const result = yield* createSymlink({ target, link: linkA }).pipe(Effect.flip);
        expect(result._tag).toBe("SymlinkCreationError");
        expect(fs.readlinkSync(linkA)).toBe("link-b");
        expect(fs.readlinkSync(linkB)).toBe("link-a");
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

  it.effect("creates a valid link below a missing directory reached through an alias", () =>
    withNodeContext(
      Effect.gen(function* () {
        const realDir = path.join(tmpDir, "real-dir");
        const target = path.join(realDir, "target");
        fs.mkdirSync(target, { recursive: true });

        const aliasDir = path.join(tmpDir, "alias-dir");
        fs.symlinkSync(realDir, aliasDir);
        const link = path.join(aliasDir, "missing", "nested", "link");

        const result = yield* createSymlink({ target, link });

        expect(result).toBe("created");
        expect(fs.realpathSync(link)).toBe(target);
      }),
    ),
  );
});

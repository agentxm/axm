import {
  captureCopiedDirectory,
  copiedDirectoryReceiptPath,
  NativeEntryRemoval,
  resolveNativeReferent,
} from "@agentxm/workspace-kernel/locations";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { runWorkspaceTransaction } from "@agentxm/workspace-kernel/settlement";
import { WorkspaceTransactionScopeTest } from "@agentxm/workspace-kernel/settlement/testing";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import { NativeWriteAuthorityPermissive } from "@agentxm/workspace-kernel/agent-adapters/testing";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import {
  ensureSkillAgentArtifact,
  inspectSkillAgentArtifact,
  removeSkillAgentArtifact,
} from "./materialization.js";

const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const baseDir = yield* fs.makeTempDirectoryScoped({ prefix: "axm-skill-native-" });
  const source = path.join(baseDir, "source", "review");
  const targetDir = path.join(baseDir, ".agents/skills");
  yield* fs.makeDirectory(source, { recursive: true });
  yield* fs.writeFileString(path.join(source, "SKILL.md"), "# Source must survive\n");
  const args = {
    nativeRoots: [baseDir],
    nativeInsertionEligible: true,
    baseDir,
    canonicalSkillSrcPath: source,
    targetDir,
    sanitizedName: "review",
  };
  return { fs, path, source, target: path.join(targetDir, "review"), args };
});

const previousCopiedFiles = ["SKILL.md", "README.md", "notes.txt"];

/** A copy at the target whose receipt names a previous canonical source. */
const previousSourceCopy = Effect.gen(function* () {
  const context = yield* fixture;
  const { fs, path, target, args } = context;
  const previous = path.join(args.baseDir, "previous", "review");
  for (const directory of [previous, target]) {
    yield* fs.makeDirectory(directory, { recursive: true });
    for (const name of previousCopiedFiles)
      yield* fs.writeFileString(path.join(directory, name), `Previous ${name}\n`);
    yield* fs.symlink("README.md", path.join(directory, "link"));
  }
  const previousSource = yield* resolveNativeReferent(previous);
  expect(Option.isSome(yield* captureCopiedDirectory(target, previousSource))).toBe(true);
  return { ...context, previous, receiptPath: yield* copiedDirectoryReceiptPath(target) };
});

describe("Skill native materialization", () => {
  it.effect("restores the owned link when interrupted after native removal", () =>
    Effect.gen(function* () {
      const { fs, path, source, target, args } = yield* fixture;
      const workspaceDir = path.join(args.baseDir, ".axm");
      yield* fs.makeDirectory(workspaceDir);
      yield* fs.makeDirectory(args.targetDir, { recursive: true });
      yield* fs.symlink(source, target);
      const before = (yield* fs.readDirectory(args.baseDir, { recursive: true })).sort();
      const published = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const removal = yield* NativeEntryRemoval;
      const controlled = NativeEntryRemoval.of({
        ...removal,
        unlink: (entry) =>
          removal
            .unlink(entry)
            .pipe(
              Effect.andThen(Deferred.succeed(published, undefined)),
              Effect.andThen(Deferred.await(release)),
            ),
      });

      yield* Effect.gen(function* () {
        const transaction = yield* runWorkspaceTransaction({
          claimDefaultTargets: false,
          targets: [args.targetDir],
          transition: removeSkillAgentArtifact(args),
          validate: () => Effect.void,
        }).pipe(
          Effect.provide(
            WorkspaceTransactionScopeTest({
              workspaceDir,
              settingsPath: path.join(args.baseDir, "axm.json"),
              lockPath: path.join(args.baseDir, "axm.lock"),
            }),
          ),
          Effect.provideService(NativeEntryRemoval, controlled),
          Effect.forkChild,
        );
        yield* Deferred.await(published);
        expect(yield* fs.exists(target)).toBe(false);
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
        expect((yield* fs.readDirectory(args.baseDir, { recursive: true })).sort()).toEqual(before);
        expect(yield* fs.readLink(target)).toBe(source);
        expect(yield* fs.readFileString(path.join(source, "SKILL.md"))).toBe(
          "# Source must survive\n",
        );
      }).pipe(Effect.ensuring(Deferred.succeed(release, undefined)));
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NativePlatformTest)),
    ),
  );

  it.effect("removes an owned directory link without removing its canonical skill", () =>
    Effect.gen(function* () {
      const { fs, path, source, target, args } = yield* fixture;
      yield* fs.makeDirectory(args.targetDir, { recursive: true });
      yield* fs.symlink(source, target);
      yield* removeSkillAgentArtifact(args);
      expect(yield* fs.exists(target)).toBe(false);
      expect(yield* fs.readFileString(path.join(source, "SKILL.md"))).toBe(
        "# Source must survive\n",
      );
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NativePlatformTest)),
    ),
  );

  it.effect("does not self-copy through a parent-directory alias", () =>
    Effect.gen(function* () {
      const { fs, path, source, args } = yield* fixture;
      const alias = path.join(args.baseDir, "alias");
      yield* fs.symlink(path.dirname(source), alias);
      yield* ensureSkillAgentArtifact({ ...args, targetDir: alias });
      expect(yield* fs.readFileString(path.join(source, "SKILL.md"))).toBe(
        "# Source must survive\n",
      );
      expect(yield* fs.readDirectory(source)).toEqual(["SKILL.md"]);
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NativePlatformTest)),
    ),
  );

  it.effect("never upgrades a chained foreign link into deletion ownership", () =>
    Effect.gen(function* () {
      const { fs, path, source, target, args } = yield* fixture;
      const intermediate = path.join(args.baseDir, "foreign");
      yield* fs.symlink(source, intermediate);
      yield* fs.makeDirectory(args.targetDir, { recursive: true });
      yield* fs.symlink(intermediate, target);
      const result = yield* ensureSkillAgentArtifact(args).pipe(Effect.flip);
      expect(result._tag).toBe("SkillMaterializationFailed");
      yield* removeSkillAgentArtifact(args);
      expect(yield* fs.readLink(target)).toBe(intermediate);
      expect(yield* fs.readFileString(path.join(source, "SKILL.md"))).toBe(
        "# Source must survive\n",
      );
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NativePlatformTest)),
    ),
  );

  it.effect.each(["EACCES", "EIO", "ENOSPC"])("does not fall back to a copy after %s", (code) =>
    Effect.gen(function* () {
      const { fs, target, args } = yield* fixture;
      const denied = {
        ...fs,
        symlink: () =>
          Effect.fail(
            PlatformError.systemError({
              _tag: "Unknown",
              module: "FileSystem",
              method: "symlink",
              cause: { code },
            }),
          ),
      } satisfies FileSystem.FileSystem;
      const result = yield* ensureSkillAgentArtifact(args).pipe(
        Effect.provideService(FileSystem.FileSystem, denied),
        Effect.flip,
      );
      expect(result._tag).toBe("SkillMaterializationFailed");
      expect(yield* fs.exists(target)).toBe(false);
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NativePlatformTest)),
    ),
  );

  it.effect("uses a bounded copy only for unsupported links and preserves foreign children", () =>
    Effect.gen(function* () {
      const { fs, path, source, target, args } = yield* fixture;
      const supportingFiles = [
        "README.md",
        "metadata.json",
        ".axm-copy.json",
        "_assets/template.txt",
        "scripts/run",
      ];
      for (const name of supportingFiles) {
        yield* fs.makeDirectory(path.dirname(path.join(source, name)), { recursive: true });
        yield* fs.writeFileString(path.join(source, name), `Original ${name}\n`);
      }
      yield* fs.chmod(path.join(source, "scripts/run"), 0o755);
      const unsupported = {
        ...fs,
        symlink: () =>
          Effect.fail(
            PlatformError.systemError({
              _tag: "Unknown",
              module: "FileSystem",
              method: "symlink",
              cause: { code: "ENOSYS" },
            }),
          ),
      } satisfies FileSystem.FileSystem;
      yield* ensureSkillAgentArtifact(args).pipe(
        Effect.provideService(FileSystem.FileSystem, unsupported),
      );
      for (const name of supportingFiles) {
        expect(yield* fs.readFileString(path.join(target, name))).toBe(`Original ${name}\n`);
      }
      expect((yield* fs.stat(path.join(target, "scripts/run"))).mode & 0o777).toBe(0o755);
      const receipt = yield* fs.readFileString(yield* copiedDirectoryReceiptPath(target));
      yield* fs.writeFileString(path.join(target, "personal.txt"), "Foreign\n");
      yield* ensureSkillAgentArtifact(args).pipe(
        Effect.provideService(FileSystem.FileSystem, unsupported),
      );
      expect(yield* fs.readFileString(yield* copiedDirectoryReceiptPath(target))).toBe(receipt);
      yield* fs.writeFileString(path.join(source, "SKILL.md"), "# Updated source\n");
      const refused = yield* ensureSkillAgentArtifact(args).pipe(
        Effect.provideService(FileSystem.FileSystem, unsupported),
        Effect.flip,
      );
      expect(refused._tag).toBe("SkillMaterializationFailed");
      expect(yield* fs.readFileString(yield* copiedDirectoryReceiptPath(target))).toBe(receipt);
      expect(yield* fs.readFileString(path.join(target, "SKILL.md"))).toBe(
        "# Source must survive\n",
      );
      yield* removeSkillAgentArtifact(args);
      expect(yield* fs.readFileString(path.join(target, "personal.txt"))).toBe("Foreign\n");
      expect(yield* fs.exists(path.join(target, "SKILL.md"))).toBe(false);
      expect(yield* fs.readFileString(path.join(source, "SKILL.md"))).toBe("# Updated source\n");
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NativePlatformTest)),
    ),
  );

  it.effect("preserves an unowned native directory on install and removal", () =>
    Effect.gen(function* () {
      const { fs, path, target, args } = yield* fixture;
      yield* fs.makeDirectory(target, { recursive: true });
      yield* fs.writeFileString(path.join(target, "SKILL.md"), "# User\n");
      yield* ensureSkillAgentArtifact(args).pipe(Effect.flip);
      yield* removeSkillAgentArtifact(args);
      expect(yield* fs.readFileString(path.join(target, "SKILL.md"))).toBe("# User\n");
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NativePlatformTest)),
    ),
  );
  it.effect(
    "retains contained file and directory links through copied projection update and removal",
    () =>
      Effect.gen(function* () {
        const { fs, path, source, target, args } = yield* fixture;
        yield* fs.makeDirectory(path.join(source, "assets"));
        yield* fs.writeFileString(path.join(source, "assets/run"), "#!/bin/sh\necho original\n");
        yield* fs.chmod(path.join(source, "assets/run"), 0o755);
        yield* fs.symlink("assets/run", path.join(source, "run"));
        yield* fs.symlink(".", path.join(source, "self"));
        const unsupportedDirectoryProjection = {
          ...fs,
          symlink: (from: string, to: string) =>
            to === target
              ? Effect.fail(
                  PlatformError.systemError({
                    _tag: "Unknown",
                    module: "FileSystem",
                    method: "symlink",
                    cause: { code: "ENOSYS" },
                  }),
                )
              : fs.symlink(from, to),
        } satisfies FileSystem.FileSystem;
        const ensure = ensureSkillAgentArtifact(args).pipe(
          Effect.provideService(FileSystem.FileSystem, unsupportedDirectoryProjection),
        );
        yield* ensure;
        expect(yield* fs.readLink(path.join(target, "run"))).toBe("assets/run");
        expect(yield* fs.readLink(path.join(target, "self"))).toBe(".");
        expect((yield* fs.stat(path.join(target, "run"))).mode & 0o111).toBe(0o111);
        expect(yield* ensure).toBe("unchanged");
        yield* fs.writeFileString(path.join(source, "assets/run"), "#!/bin/sh\necho updated\n");
        yield* ensure;
        expect(yield* fs.readFileString(path.join(target, "run"))).toBe(
          "#!/bin/sh\necho updated\n",
        );
        expect(yield* fs.readLink(path.join(target, "self"))).toBe(".");
        yield* removeSkillAgentArtifact(args);
        expect(yield* fs.exists(target)).toBe(false);
        expect(yield* fs.exists(yield* copiedDirectoryReceiptPath(target))).toBe(false);
        expect(yield* fs.readLink(path.join(source, "run"))).toBe("assets/run");
        expect(yield* fs.readFileString(path.join(source, "run"))).toBe(
          "#!/bin/sh\necho updated\n",
        );
      }).pipe(
        Effect.scoped,
        Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NativePlatformTest)),
      ),
  );

  it.effect("reads a previous source's copied receipt once for ownership and replacement", () =>
    Effect.gen(function* () {
      const { fs, path, source, target, args, previous, receiptPath } = yield* previousSourceCopy;
      const { fileSystem, recording } = makeRecordingFileSystem(fs);
      recording.reset();
      const inspection = yield* inspectSkillAgentArtifact({
        ...args,
        previousCanonicalSkillSrcPaths: [previous],
      }).pipe(Effect.provideService(FileSystem.FileSystem, fileSystem));
      expect(inspection.state).toBe("ready");
      expect(inspection.source).toBe(yield* resolveNativeReferent(source));
      expect(recording.counts(receiptPath).readFile).toBe(2);
      for (const name of previousCopiedFiles)
        expect(recording.contentReads(path.join(target, name))).toBe(1);
      expect(recording.counts(path.join(target, "link")).readLink).toBe(3);
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NativePlatformTest)),
    ),
  );

  it.effect("refuses a copied file edited after the currency hash pass before any mutation", () =>
    Effect.gen(function* () {
      const { fs, path, source, target, args, receiptPath } = yield* fixture.pipe(
        Effect.flatMap((fixture) =>
          Effect.gen(function* () {
            const { fs, path, source, target } = fixture;
            yield* fs.makeDirectory(target, { recursive: true });
            for (const name of ["SKILL.md", "README.md"])
              yield* fs.writeFileString(path.join(target, name), `Copied ${name}\n`);
            yield* fs.writeFileString(path.join(source, "SKILL.md"), "Copied SKILL.md\n");
            yield* fs.writeFileString(path.join(source, "README.md"), "Copied README.md\n");
            const canonicalSource = yield* resolveNativeReferent(source);
            expect(Option.isSome(yield* captureCopiedDirectory(target, canonicalSource))).toBe(
              true,
            );
            yield* fs.writeFileString(path.join(source, "SKILL.md"), "Updated SKILL.md\n");
            return { ...fixture, receiptPath: yield* copiedDirectoryReceiptPath(target) };
          }),
        ),
      );
      const receipt = yield* fs.readFileString(receiptPath);
      const canonicalSource = yield* resolveNativeReferent(source);
      let edited = false;
      // The currency check hashes every copied file before it walks the source.
      const editDuringSourceWalk = {
        ...fs,
        readDirectory: (directory, options) =>
          directory === canonicalSource && !edited
            ? fs.writeFileString(path.join(target, "README.md"), "Foreign edit\n").pipe(
                Effect.tap(() =>
                  Effect.sync(() => {
                    edited = true;
                  }),
                ),
                Effect.andThen(fs.readDirectory(directory, options)),
              )
            : fs.readDirectory(directory, options),
      } satisfies FileSystem.FileSystem;
      const refused = yield* ensureSkillAgentArtifact(args).pipe(
        Effect.provideService(FileSystem.FileSystem, editDuringSourceWalk),
        Effect.flip,
      );
      expect(edited).toBe(true);
      expect(refused).toMatchObject({
        _tag: "SkillMaterializationFailed",
        detail: `Preserved modified copied skill at ${target}`,
      });
      expect(yield* fs.readFileString(receiptPath)).toBe(receipt);
      expect(yield* fs.readFileString(path.join(target, "README.md"))).toBe("Foreign edit\n");
      expect(yield* fs.readFileString(path.join(target, "SKILL.md"))).toBe("Copied SKILL.md\n");
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NativePlatformTest)),
    ),
  );

  it.effect("lets retirement refuse a copied root replaced after inspection", () =>
    Effect.gen(function* () {
      const { fs, path, target, args, previous, receiptPath } = yield* previousSourceCopy;
      const moved = path.join(args.baseDir, "moved-review");
      const receipt = yield* fs.readFileString(receiptPath);
      let receiptReads = 0;
      // Inspection reads the receipt for currency and for ownership; the next read is retirement's.
      const replaceBeforeRetirement = {
        ...fs,
        readFileString: (file, encoding) =>
          file === receiptPath && ++receiptReads === 3
            ? fs
                .rename(target, moved)
                .pipe(
                  Effect.andThen(fs.makeDirectory(target)),
                  Effect.andThen(
                    fs.writeFileString(path.join(target, "SKILL.md"), "Replacement\n"),
                  ),
                  Effect.andThen(fs.readFileString(file, encoding)),
                )
            : fs.readFileString(file, encoding),
      } satisfies FileSystem.FileSystem;
      const refused = yield* ensureSkillAgentArtifact({
        ...args,
        previousCanonicalSkillSrcPaths: [previous],
      }).pipe(Effect.provideService(FileSystem.FileSystem, replaceBeforeRetirement), Effect.flip);
      expect(receiptReads).toBe(3);
      expect(refused).toMatchObject({
        _tag: "SkillMaterializationFailed",
        detail: `Preserved modified copied skill at ${target}`,
      });
      expect(yield* fs.readFileString(receiptPath)).toBe(receipt);
      expect(yield* fs.readDirectory(target)).toEqual(["SKILL.md"]);
      expect(yield* fs.readFileString(path.join(target, "SKILL.md"))).toBe("Replacement\n");
      for (const name of previousCopiedFiles)
        expect(yield* fs.readFileString(path.join(moved, name))).toBe(`Previous ${name}\n`);
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NativePlatformTest)),
    ),
  );
});

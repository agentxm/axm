import { copiedDirectoryReceiptPath } from "@agentxm/workspace-kernel/locations";
import * as Layer from "effect/Layer";
import { NativeWriteAuthorityPermissive } from "@agentxm/workspace-kernel/agent-adapters/testing";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { ensureSkillAgentArtifact, removeSkillAgentArtifact } from "./materialization.js";

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

describe("Skill native materialization", () => {
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
      Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NodeServices.layer)),
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
      Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NodeServices.layer)),
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
      Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NodeServices.layer)),
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
      Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NodeServices.layer)),
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
      Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NodeServices.layer)),
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
      Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NodeServices.layer)),
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
        Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NodeServices.layer)),
      ),
  );
});

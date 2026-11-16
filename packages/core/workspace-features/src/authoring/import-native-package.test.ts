import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { makeRecordingFileSystem, type FileSystemRecording } from "@agentxm/test-support";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Result from "effect/Result";
import type { ExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions/common";
import {
  NativeImportConflict,
  NativeImportInvalid,
  NativeImportUnsupported,
} from "./authored-package-errors.js";
import { extensionName, handle } from "./test-helpers.js";
import {
  importNativeExtensionPackage,
  type ImportNativeExtensionPackageArgs,
} from "./import-native-package.js";

const nativeSubagent = "---\nname: reviewer\ndescription: Review evidence\n---\n\nReview.\n";
const nativeSkill = "---\nname: review\ndescription: Review code\n---\n\n# Review\n";

const subagentTarget: ExtensionFqnParts = {
  owner: handle("@acme"),
  type: "subagent",
  name: extensionName("reviewer"),
};
const skillTarget: ExtensionFqnParts = {
  owner: handle("@acme"),
  type: "skill",
  name: extensionName("review"),
};

/** Run one import over the real filesystem, recording only the import's own calls. */
const recordedImport = (args: ImportNativeExtensionPackageArgs) =>
  Effect.gen(function* () {
    const { fileSystem, recording } = makeRecordingFileSystem(yield* FileSystem.FileSystem);
    recording.reset();
    const result = yield* Effect.result(
      importNativeExtensionPackage(args).pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
      ),
    );
    return { result, recording };
  }).pipe(Effect.provide(NodeServices.layer));

const sourceCalls = (recording: FileSystemRecording, sourcePath: string) => ({
  stat: recording.calls({ path: sourcePath, method: "stat" }).length,
  readDirectory: recording.calls({ path: sourcePath, method: "readDirectory" }).length,
});

const failureOf = <A, E>(result: Result.Result<A, E>): E | undefined =>
  Result.isFailure(result) ? result.failure : undefined;

describe("importNativeExtensionPackage", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-import-native-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const write = (relative: string, content: string): string => {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    return target;
  };

  it.effect("rejects extension types without a native package-conversion contract", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        importNativeExtensionPackage({
          sourcePath: root,
          targetDir: path.join(root, "rule-package"),
          target: { owner: handle("@acme"), type: "rule", name: extensionName("policy") },
        }),
      ).pipe(Effect.provide(NodeServices.layer));

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure).toBeInstanceOf(NativeImportUnsupported);
        expect(result.failure instanceof NativeImportUnsupported ? result.failure.type : "").toBe(
          "rule",
        );
      }
      expect(fs.existsSync(path.join(root, "rule-package"))).toBe(false);
    }),
  );

  describe("native source inspection", () => {
    it.effect("inspects a subagent source directory once to pick its definition file", () =>
      Effect.gen(function* () {
        const sourcePath = path.join(root, "native");
        write("native/Reviewer.MD", nativeSubagent);
        write("native/README.md", "# Readme\n");
        const targetDir = path.join(root, "staging", "package");

        const { result, recording } = yield* recordedImport({
          sourcePath,
          targetDir,
          target: subagentTarget,
          sourceAgent: "claude-code",
        });

        expect(Result.isSuccess(result)).toBe(true);
        expect(sourceCalls(recording, sourcePath)).toEqual({ stat: 1, readDirectory: 1 });
        // README.md is never a candidate and the extension match ignores case.
        expect(
          fs.readFileSync(path.join(targetDir, "native", "claude-code", "Reviewer.MD"), "utf8"),
        ).toBe(nativeSubagent);
      }),
    );

    it.effect("inspects a subagent source file once and lists only its parent", () =>
      Effect.gen(function* () {
        const sourcePath = write("native/reviewer.md", nativeSubagent);
        const targetDir = path.join(root, "staging", "package");

        const { result, recording } = yield* recordedImport({
          sourcePath,
          targetDir,
          target: subagentTarget,
          sourceAgent: "claude-code",
        });

        expect(Result.isSuccess(result)).toBe(true);
        expect(sourceCalls(recording, sourcePath)).toEqual({ stat: 1, readDirectory: 0 });
        expect(sourceCalls(recording, path.dirname(sourcePath)).readDirectory).toBe(1);
        expect(
          fs.readFileSync(path.join(targetDir, "native", "claude-code", "reviewer.md"), "utf8"),
        ).toBe(nativeSubagent);
      }),
    );

    it.effect("chooses the skill directory copy without a second inspection of the source", () =>
      Effect.gen(function* () {
        const sourcePath = path.join(root, "native");
        write("native/SKILL.md", nativeSkill);
        write("native/notes/a.md", "a\n");
        const targetDir = path.join(root, "staging", "package");

        const { result, recording } = yield* recordedImport({
          sourcePath,
          targetDir,
          target: skillTarget,
        });

        expect(Result.isSuccess(result)).toBe(true);
        // The managed-manifest check stats and lists the source once; the other
        // calls are the directory copy's own overlap checks, native path
        // resolution and root scan, which keep reading live.
        expect(sourceCalls(recording, sourcePath)).toEqual({ stat: 5, readDirectory: 6 });
        expect(fs.readFileSync(path.join(targetDir, "src", "SKILL.md"), "utf8")).toBe(nativeSkill);
        expect(fs.readFileSync(path.join(targetDir, "src", "notes", "a.md"), "utf8")).toBe("a\n");
      }),
    );

    it.effect("copies a skill document after one inspection of the source", () =>
      Effect.gen(function* () {
        const sourcePath = write("native/SKILL.md", nativeSkill);
        const targetDir = path.join(root, "staging", "package");

        const { result, recording } = yield* recordedImport({
          sourcePath,
          targetDir,
          target: skillTarget,
        });

        expect(Result.isSuccess(result)).toBe(true);
        expect(sourceCalls(recording, sourcePath)).toEqual({ stat: 1, readDirectory: 0 });
        expect(fs.readFileSync(path.join(targetDir, "src", "SKILL.md"), "utf8")).toBe(nativeSkill);
      }),
    );
  });

  describe("subagent definition-file selection", () => {
    const exactlyOne =
      "Native subagent import requires exactly one definition file; select a file explicitly";

    it.effect("refuses a source directory without a definition file", () =>
      Effect.gen(function* () {
        const sourcePath = path.join(root, "native");
        write("native/README.md", "# Readme\n");
        write("native/notes.txt", "notes\n");
        const targetDir = path.join(root, "staging", "package");

        const { result } = yield* recordedImport({
          sourcePath,
          targetDir,
          target: subagentTarget,
          sourceAgent: "claude-code",
        });

        const failure = failureOf(result);
        expect(failure).toBeInstanceOf(NativeImportInvalid);
        expect(failure instanceof NativeImportInvalid ? failure.detail : "").toBe(exactlyOne);
        expect(fs.existsSync(targetDir)).toBe(false);
      }),
    );

    it.effect("refuses a source directory with two definition files", () =>
      Effect.gen(function* () {
        const sourcePath = path.join(root, "native");
        write("native/reviewer.md", nativeSubagent);
        write("native/reviewer.toml", 'name = "reviewer"\n');
        const targetDir = path.join(root, "staging", "package");

        const { result } = yield* recordedImport({
          sourcePath,
          targetDir,
          target: subagentTarget,
          sourceAgent: "claude-code",
        });

        const failure = failureOf(result);
        expect(failure).toBeInstanceOf(NativeImportInvalid);
        expect(failure instanceof NativeImportInvalid ? failure.detail : "").toBe(exactlyOne);
        expect(fs.existsSync(targetDir)).toBe(false);
      }),
    );

    it.effect("refuses a managed package before choosing a definition file", () =>
      Effect.gen(function* () {
        const sourcePath = path.join(root, "native");
        write("native/subagent.json", "{}\n");
        write("native/reviewer.md", nativeSubagent);
        write("native/other.md", nativeSubagent);
        const targetDir = path.join(root, "staging", "package");

        const { result } = yield* recordedImport({
          sourcePath,
          targetDir,
          target: subagentTarget,
          sourceAgent: "claude-code",
        });

        const failure = failureOf(result);
        expect(failure).toBeInstanceOf(NativeImportInvalid);
        expect(failure instanceof NativeImportInvalid ? failure.detail : "").toBe(
          "Source is already a managed AXM package (subagent.json); use fork instead of import",
        );
      }),
    );

    it.effect("reports an occupied target before refusing the definition files", () =>
      Effect.gen(function* () {
        const sourcePath = path.join(root, "native");
        write("native/reviewer.md", nativeSubagent);
        write("native/other.md", nativeSubagent);
        const targetDir = path.join(root, "staging", "package");
        fs.mkdirSync(targetDir, { recursive: true });

        const { result } = yield* recordedImport({
          sourcePath,
          targetDir,
          target: subagentTarget,
          sourceAgent: "claude-code",
        });

        const failure = failureOf(result);
        expect(failure).toBeInstanceOf(NativeImportConflict);
        expect(failure instanceof NativeImportConflict ? failure.targetDir : "").toBe(targetDir);
      }),
    );

    // Named pipes are not filesystem entries on Windows.
    it.effect.skipIf(process.platform === "win32")(
      "refuses a source that is neither a file nor a directory",
      () =>
        Effect.gen(function* () {
          const sourcePath = path.join(root, "native.md");
          execFileSync("mkfifo", [sourcePath]);
          const targetDir = path.join(root, "staging", "package");

          const { result, recording } = yield* recordedImport({
            sourcePath,
            targetDir,
            target: subagentTarget,
            sourceAgent: "claude-code",
          });

          const failure = failureOf(result);
          expect(failure).toBeInstanceOf(NativeImportInvalid);
          expect(failure instanceof NativeImportInvalid ? failure.detail : "").toBe(
            "Native subagent source must be a file or directory",
          );
          expect(sourceCalls(recording, sourcePath)).toEqual({ stat: 1, readDirectory: 0 });
          expect(fs.existsSync(targetDir)).toBe(false);
        }),
    );
  });
});

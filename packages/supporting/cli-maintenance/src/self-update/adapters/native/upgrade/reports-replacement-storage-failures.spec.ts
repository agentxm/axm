import { defineSpecification } from "@agentxm/specification-metadata";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import { Script } from "../../../domain/index.js";
import { commandExited, makeUpgradeTrial } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/upgrade/reports-replacement-storage-failures",
  title: "Script upgrades distinguish storage failures from an occupied installation",
  statement:
    "When a script upgrade cannot inspect or acquire its installation lock, prepare its replacement, or protect, replace, or restore its executable, AXM shall report the failed operation without claiming another upgrade owns the installation, preserve the original executable when restoration succeeds, and identify a retained recovery backup when restoration fails.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: ["The filesystem reports completed operations truthfully."],
  openQuestions: [],
});

const permissionDenied = (method: string) =>
  PlatformError.systemError({
    _tag: "PermissionDenied",
    module: "FileSystem",
    method,
    description: "Foreign description containing secret fixture data",
  });

const installation = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: "axm-storage-failure-" });
  const target = path.join(directory, process.platform === "win32" ? "axm.exe" : "axm");
  yield* fs.writeFileString(target, "original executable");
  return { fs, target: yield* fs.realPath(target) };
});

describe("Script upgrade storage failures", () => {
  for (const step of [
    "lock-create",
    "lock-read",
    "lock-decode",
    "stage-executable",
    "protect-original",
    "replace-executable",
  ] as const) {
    it.effect(`reports ${step} and preserves the original executable`, () =>
      Effect.gen(function* () {
        const { fs, target } = yield* installation;
        if (step === "lock-read" || step === "lock-decode") {
          yield* fs.writeFileString(`${target}.upgrade.lock`, "invalid lock");
        }
        const failingFs: FileSystem.FileSystem = {
          ...fs,
          writeFileString: (file, content, options) =>
            step === "lock-create" && file.endsWith(".upgrade.lock")
              ? Effect.fail(permissionDenied("writeFileString"))
              : fs.writeFileString(file, content, options),
          readFileString: (file, encoding) =>
            step === "lock-read" && file.endsWith(".upgrade.lock")
              ? Effect.fail(permissionDenied("readFileString"))
              : fs.readFileString(file, encoding),
          writeFile: (file, content, options) =>
            step === "stage-executable" && file.includes(".axm-upgrade-")
              ? Effect.fail(permissionDenied("writeFile"))
              : fs.writeFile(file, content, options),
          copyFile: (source, destination) =>
            step === "protect-original"
              ? Effect.fail(permissionDenied("copyFile"))
              : fs.copyFile(source, destination),
          rename: (source, destination) =>
            (step === "replace-executable" && source.includes(".axm-upgrade-")) ||
            (step === "protect-original" && source === target)
              ? Effect.fail(permissionDenied("rename"))
              : fs.rename(source, destination),
        };
        const trial = yield* makeUpgradeTrial({ method: new Script({ execPath: target }) });
        const failure = yield* Effect.flip(
          trial.run().pipe(Effect.provideService(FileSystem.FileSystem, failingFs)),
        );
        expect(failure._tag).toBe("UpgradeFailed");
        expect(failure.step).toBe(step);
        expect(failure.detail).not.toContain("Another upgrade");
        expect(JSON.stringify(failure)).not.toContain("secret fixture data");
        expect(yield* fs.readFileString(target)).toBe("original executable");
        expect(trial.installMetaWrites).toEqual([]);
        if (step === "replace-executable") {
          expect(failure.detail).toContain("The original executable was restored.");
          expect(failure.backupPath).toBeUndefined();
          expect(failure.detail).not.toContain("Recoverable backup:");
        }
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  }

  it.effect("reports a real active owner without modifying its lock or executable", () =>
    Effect.gen(function* () {
      const { fs, target } = yield* installation;
      const lock = JSON.stringify({ pid: process.pid, targetPath: target, backupPath: null });
      yield* fs.writeFileString(`${target}.upgrade.lock`, lock);
      const trial = yield* makeUpgradeTrial({ method: new Script({ execPath: target }) });
      expect((yield* trial.run()).disposition).toBe("recovery-required");
      expect(yield* fs.readFileString(`${target}.upgrade.lock`)).toBe(lock);
      expect(yield* fs.readFileString(target)).toBe("original executable");
      expect(trial.releaseRequests).not.toContain(expect.stringContaining("checksums"));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "identifies an existing original backup when replacement verification and restoration fail",
    () =>
      Effect.gen(function* () {
        const { fs, target } = yield* installation;
        const failingFs: FileSystem.FileSystem = {
          ...fs,
          rename: (source, destination) =>
            source.includes(".axm-backup-")
              ? Effect.fail(permissionDenied("rename"))
              : fs.rename(source, destination),
        };
        const trial = yield* makeUpgradeTrial({
          method: new Script({ execPath: target }),
          respond: (invocation) =>
            invocation.executable === target ? commandExited("77.0.0\n") : undefined,
        });
        const failure = yield* Effect.flip(
          trial.run().pipe(Effect.provideService(FileSystem.FileSystem, failingFs)),
        );
        expect(failure.step).toBe("restore-original");
        const backupPath = failure.backupPath;
        if (backupPath === undefined)
          return yield* Effect.die("Recovery failure must identify its backup");
        expect(failure.detail).toContain(backupPath);
        expect(yield* fs.readFileString(backupPath)).toBe("original executable");
        expect(trial.installMetaWrites).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

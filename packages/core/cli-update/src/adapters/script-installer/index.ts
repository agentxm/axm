import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as semver from "semver";
import {
  UpgradeFailed,
  type ExecutableReplacementLease,
  type ScriptExecutableInstallerService,
  type StagedExecutable,
} from "@agentxm/cli-maintenance/self-update/application";
import type { SubprocessService } from "../../subprocess/subprocess.js";
import { makeCommandRunner } from "../subprocess/command-evidence.js";
import { acquireUpgradeLock, updateLockBackup } from "./lock.js";

const nativeFailure = (cause: unknown) =>
  new UpgradeFailed({
    category: "internal",
    detail: "The transactional AXM replacement could not complete",
    suggestions: [{ description: "Check install-directory permissions and retry." }],
    cause,
  });

/** Own only native resource lifetime; the application chooses replacement and acceptance. */
export const makeScriptExecutableInstaller = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  subprocess: SubprocessService,
  counter: Ref.Ref<number>,
): ScriptExecutableInstallerService => {
  const run = makeCommandRunner(subprocess, counter, "script-command");
  return {
    inspect: (executablePath, purpose, workingDirectory) =>
      Effect.gen(function* () {
        const command = yield* run(purpose, executablePath, ["--version"], workingDirectory, {
          timeoutMs: 10_000,
        });
        return {
          command,
          reportedVersion: command.exitCode === 0 ? semver.valid(command.stdout.trim()) : null,
        };
      }),
    acquire: (executablePath) =>
      Effect.gen(function* () {
        const targetPath = yield* fs
          .realPath(executablePath)
          .pipe(Effect.catch(() => Effect.succeed(executablePath)));
        const lock = yield* Effect.acquireRelease(acquireUpgradeLock(fs, targetPath), (result) =>
          result.acquired ? fs.remove(result.path).pipe(Effect.ignore) : Effect.void,
        );
        if (!lock.acquired) return null;
        return {
          targetPath,
          stage: (bytes) =>
            Effect.gen(function* () {
              const targetDirectory = path.dirname(targetPath);
              const directory = yield* fs.makeTempDirectoryScoped({
                directory: targetDirectory,
                prefix: ".axm-upgrade-",
              });
              const temporaryPath = path.join(
                directory,
                process.platform === "win32" ? "axm.exe" : "axm",
              );
              const now = yield* Clock.currentTimeMillis;
              const backupPath = path.join(
                targetDirectory,
                `.axm-backup-${String(process.pid)}-${String(now)}${process.platform === "win32" ? ".exe" : ""}`,
              );
              const needsRestoration = yield* Ref.make(false);
              const restore = Effect.uninterruptible(
                Effect.gen(function* () {
                  if (process.platform === "win32")
                    yield* fs.remove(targetPath).pipe(Effect.ignore);
                  yield* fs.rename(backupPath, targetPath);
                  yield* Ref.set(needsRestoration, false);
                }).pipe(
                  Effect.as(true),
                  Effect.catch(() => Effect.succeed(false)),
                ),
              );
              yield* Effect.addFinalizer((exit) =>
                Effect.gen(function* () {
                  if (Exit.hasInterrupts(exit) && (yield* Ref.get(needsRestoration))) {
                    if (!(yield* restore)) {
                      yield* Effect.logError(
                        `Interrupted executable replacement could not restore its backup: ${backupPath}`,
                      );
                    }
                  }
                }),
              );
              const prepared = yield* Effect.gen(function* () {
                yield* fs.writeFile(temporaryPath, bytes);
                if (process.platform !== "win32") yield* fs.chmod(temporaryPath, 0o755);
              }).pipe(
                Effect.as(true),
                Effect.catch(() => Effect.succeed(false)),
              );
              if (!prepared) return null;
              return {
                path: temporaryPath,
                backupPath,
                protectOriginal: Effect.uninterruptible(
                  Effect.gen(function* () {
                    if (process.platform === "win32") {
                      yield* updateLockBackup(fs, lock.path, targetPath, backupPath);
                      yield* fs.rename(targetPath, backupPath);
                    } else {
                      yield* fs.copyFile(targetPath, backupPath);
                      yield* updateLockBackup(fs, lock.path, targetPath, backupPath);
                    }
                    yield* Ref.set(needsRestoration, true);
                  }).pipe(
                    Effect.as(true),
                    Effect.catch(() => Effect.succeed(false)),
                  ),
                ),
                replace: fs.rename(temporaryPath, targetPath).pipe(
                  Effect.as(true),
                  Effect.catch(() => Effect.succeed(false)),
                ),
                restore,
                accept: Effect.uninterruptible(
                  fs
                    .remove(backupPath)
                    .pipe(Effect.ignore, Effect.andThen(Ref.set(needsRestoration, false))),
                ),
              } satisfies StagedExecutable;
            }).pipe(Effect.mapError(nativeFailure)),
        } satisfies ExecutableReplacementLease;
      }).pipe(Effect.mapError(nativeFailure)),
  };
};

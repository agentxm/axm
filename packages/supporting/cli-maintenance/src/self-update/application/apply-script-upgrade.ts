import * as Effect from "effect/Effect";
import * as semver from "semver";
import {
  acceptsScriptExecutable,
  selectReleaseChecksum,
  type InstallMethodType,
} from "../domain/index.js";
import { UpgradeFailed } from "./errors.js";
import { noMutationResult, upgradeBaseFacts, type BaseResultInput } from "./execution-facts.js";
import type { RecommendedCommand, UpgradeCoreResult } from "./execution-result.js";
import { UpgradeExecutionObserver } from "./execution-observer.js";
import { InstallationRecorder } from "./package-installer.js";
import {
  ScriptExecutableInstaller,
  ScriptReleaseAssets,
  type ScriptReleaseSource,
} from "./script-installer.js";
import { UpgradeWorkingDirectory } from "./working-directory.js";

export interface ScriptUpgradeInput extends BaseResultInput {
  readonly method: Extract<InstallMethodType, { readonly _tag: "Script" }>;
  readonly binaryName: string;
  readonly release: ScriptReleaseSource;
  readonly recoveryCommand: RecommendedCommand;
}

/** The application owns checksum acceptance, replacement ordering, verification and recovery. */
export const applyScriptUpgrade = Effect.fn("cliMaintenance.applyScriptUpgrade")(
  function* (input: ScriptUpgradeInput) {
    const observer = yield* UpgradeExecutionObserver;
    return yield* observer.during(
      { kind: "mutation", method: input.method, targetVersion: input.targetVersion },
      Effect.scoped(
        Effect.gen(function* () {
          if (semver.valid(input.targetVersion) === null) {
            return yield* new UpgradeFailed({
              category: "validation",
              detail: "The selected upgrade target is not valid semantic version",
            });
          }
          const installer = yield* ScriptExecutableInstaller;
          const assets = yield* ScriptReleaseAssets;
          const recorder = yield* InstallationRecorder;
          const workingDirectory = yield* UpgradeWorkingDirectory;
          const lease = yield* installer.acquire(input.method.execPath);
          if (lease === null) {
            return noMutationResult(
              input,
              "manual-action-required",
              { executable: "axm", args: ["upgrade"], shellRequired: false },
              ["Another upgrade owns the installed executable lock."],
            );
          }
          const base = { ...upgradeBaseFacts(input), executablePath: lease.targetPath };
          const downloaded = yield* assets.read(input.release, input.binaryName);
          const checksum = selectReleaseChecksum(downloaded.checksumManifest, input.binaryName);
          if (!checksum.valid) {
            return yield* new UpgradeFailed({ category: "validation", detail: checksum.detail });
          }
          if (downloaded.sha256Hex !== checksum.sha256Hex) {
            return yield* new UpgradeFailed({
              category: "validation",
              detail: `Checksum mismatch for ${input.binaryName}`,
              suggestions: [
                { description: "Retry after confirming the release assets are complete." },
              ],
            });
          }
          const staged = yield* lease.stage(downloaded.bytes);
          const temporary = yield* installer.inspect(
            staged.path,
            "verification",
            workingDirectory.path,
          );
          if (
            !acceptsScriptExecutable(
              { ...temporary, exitCode: temporary.command.exitCode },
              input.targetVersion,
            )
          ) {
            return yield* new UpgradeFailed({
              category: "validation",
              detail: `Downloaded binary did not report expected version ${input.targetVersion}`,
            });
          }
          const preparedCommands = [...input.detectionCommands, temporary.command];
          yield* staged.protectOriginal;
          yield* staged.replace.pipe(
            Effect.catch((failure) =>
              Effect.gen(function* () {
                yield* staged.restore;
                return yield* new UpgradeFailed({
                  category: failure.category,
                  step: failure.step,
                  detail: `${failure.detail} The original executable was restored.`,
                  cause: failure.cause,
                  suggestions: failure.suggestions,
                });
              }),
            ),
          );
          const installed = yield* installer.inspect(
            lease.targetPath,
            "verification",
            workingDirectory.path,
          );
          const commands = [...preparedCommands, installed.command];
          const executables = [
            {
              role: "invoked" as const,
              path: lease.targetPath,
              reportedVersion: installed.reportedVersion,
              exitCode: installed.command.exitCode,
            },
          ];
          if (
            !acceptsScriptExecutable(
              { ...installed, exitCode: installed.command.exitCode },
              input.targetVersion,
            )
          ) {
            yield* staged.restore;
            const restored = yield* installer.inspect(
              lease.targetPath,
              "rollback",
              workingDirectory.path,
            );
            if (
              !acceptsScriptExecutable(
                { ...restored, exitCode: restored.command.exitCode },
                input.localVersion,
              )
            ) {
              return yield* new UpgradeFailed({
                category: "internal",
                detail: `The restored AXM executable could not be verified at ${lease.targetPath}`,
              });
            }
            return {
              ...base,
              resultStatus: "rolled-back",
              reportedVersion: restored.reportedVersion,
              verification: "mismatch",
              mutationState: "rolled-back",
              verificationExecutables: executables,
              executedCommands: [...commands, restored.command],
              recommendedCommand: input.recoveryCommand,
              details: ["The installed binary failed verification; the original was restored."],
              backupPath: null,
            } satisfies UpgradeCoreResult;
          }
          const recorded = yield* recorder.record(input.method, lease.targetPath).pipe(
            Effect.as(true),
            Effect.catch(() => Effect.succeed(false)),
          );
          if (recorded) yield* staged.accept;
          return {
            ...base,
            resultStatus: recorded
              ? input.relation === "current" && input.reinstall
                ? "reinstalled"
                : "upgraded"
              : "upgrade-incomplete",
            reportedVersion: installed.reportedVersion,
            verification: "verified",
            mutationState: "updated",
            verificationExecutables: executables,
            executedCommands: commands,
            recommendedCommand: recorded ? null : input.recoveryCommand,
            details: recorded
              ? []
              : ["AXM was updated, but install metadata could not be persisted."],
            backupPath: recorded ? null : staged.backupPath,
          } satisfies UpgradeCoreResult;
        }),
      ),
    );
  },
  Effect.satisfiesSuccessType<UpgradeCoreResult>(),
  Effect.satisfiesErrorType<UpgradeFailed>(),
);

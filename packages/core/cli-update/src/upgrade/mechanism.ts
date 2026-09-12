/**
 * Remaining native inspection, preview descriptions, and script replacement.
 * Package-manager protocol adapters return facts to CLI maintenance, which owns
 * mutation ordering and verification policy. The script path still combines
 * application sequencing with filesystem integration pending its extraction.
 *
 * The capability keeps its own upgrade lock and atomic replacement: it
 * replaces an executable outside any workspace, so it is deliberately not a
 * `@agentxm/workspace-transactions` closure.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  Npm,
  Pnpm,
  Unknown,
  Yarn,
  type InstallMethodType,
  type PlatformBinaryInfo,
  methodName,
} from "@agentxm/cli-maintenance/self-update/domain";

import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as semver from "semver";

import { makeThrottledUnitProgress, observeChildUnit } from "@agentxm/workspace-operations";

import {
  UpgradeFailed,
  UpgradeWorkingDirectory,
  InstallationRecorder,
  upgradeBaseFacts,
  noMutationResult,
  type BaseResultInput,
  type CommandRecord,
  type RecommendedCommand,
  type UpgradeCoreResult,
} from "@agentxm/cli-maintenance/self-update/application";
import {
  methodLabel,
  formatRecommendedCommand,
} from "@agentxm/cli-maintenance/self-update/adapters/cli";

import {
  Subprocess,
  type CommandResult,
  type RunCommandOptions,
} from "../subprocess/subprocess.js";

import { packageManagerCommand } from "../adapters/package-installers/commands.js";

const displayArgument = (argument: string): string =>
  /^[A-Za-z0-9_./:@=-]+$/u.test(argument) ? argument : `'${argument.replaceAll("'", "'\\''")}'`;

const displayCommand = (executable: string, args: ReadonlyArray<string>): string =>
  [executable, ...args].map(displayArgument).join(" ");

const recommended = (
  executable: string,
  args: ReadonlyArray<string>,
  shellRequired = false,
): RecommendedCommand => ({
  executable,
  args: [...args],
  shellRequired,
});

export const recoveryInstaller = (targetVersion: string): RecommendedCommand => {
  if (process.platform === "win32") {
    const display = `$env:AXM_INSTALL_VERSION='${targetVersion}'; irm https://axm.sh/install.ps1 | iex`;
    return recommended("powershell", ["-Command", display], true);
  }
  const display = `curl -fsSL https://axm.sh/install.sh | AXM_INSTALL_VERSION=${targetVersion} sh`;
  return recommended("sh", ["-c", display], true);
};

/**
 * What the mutation would hand to the installer, in the installer's own
 * terms. A package manager is named by the exact command; the script
 * installer has no delegate, so its own replacement is named instead.
 */
const delegatedAction = (
  method: InstallMethodType,
  targetVersion: string,
  reinstall: boolean,
  binaryName: string,
): string => {
  const command = packageManagerCommand(method, targetVersion, reinstall);
  if (command !== null) return `Would run ${formatRecommendedCommand(command)}`;
  if (method._tag === "Script") {
    return `Would replace ${method.execPath} with ${binaryName} ${targetVersion}, verifying its checksum first`;
  }
  return `No installer command is available for ${methodLabel(methodName(method))}`;
};

/**
 * The resolved plan, reported without performing it. Nothing here mutates:
 * the detection and selection that produced it are reads, and the delegated
 * action is described rather than run.
 */
export const previewResult = (input: BaseResultInput, binaryName: string): UpgradeCoreResult => ({
  ...upgradeBaseFacts(input),
  resultStatus: "preview",
  reportedVersion: null,
  verification: "not-attempted",
  mutationState: "not-attempted",
  verificationExecutables: [],
  executedCommands: [...input.detectionCommands],
  recommendedCommand: null,
  details: [
    delegatedAction(
      input.method,
      input.targetVersion,
      input.relation === "current" && input.reinstall,
      binaryName,
    ),
  ],
  backupPath: null,
});

const commandRecord = (
  purpose: CommandRecord["purpose"],
  executable: string,
  args: ReadonlyArray<string>,
  result: CommandResult | null,
  failureDetail = "",
): CommandRecord => ({
  purpose,
  executable,
  args: [...args],
  display: displayCommand(executable, args),
  executionState: result?.executionState ?? "not-started",
  exitCode: result?.exitCode ?? null,
  stdout: result?.stdout ?? "",
  stderr: result?.stderr ?? failureDetail,
  outputTruncated: result?.stdoutTruncated === true || result?.stderrTruncated === true,
});

/** How a finished external command settles its unit: silent when it worked. */
const commandOutcome = (result: CommandResult): string | null => {
  switch (result.executionState) {
    case "not-started":
      return "did not start";
    case "timed-out":
      return "timed out";
    case "exited":
      return result.exitCode === 0
        ? null
        : `exit ${result.exitCode === null ? "unavailable" : String(result.exitCode)}`;
  }
};

/**
 * Run one external command, recording its evidence and narrating it as a unit
 * nested under the step that delegated it. Every command AXM hands to another
 * tool is separately observable while it runs — the reader sees which tool is
 * working, not one unchanging line for the whole delegation. The record index
 * names the unit, so repeated verification commands stay distinct.
 */
const runRecorded = (
  records: Array<CommandRecord>,
  purpose: CommandRecord["purpose"],
  executable: string,
  args: ReadonlyArray<string>,
  options?: RunCommandOptions,
) => {
  const display = displayCommand(executable, args);
  return observeChildUnit(
    {
      id: `command-${String(records.length)}`,
      label: display,
      resolvedLabel: (result: CommandResult) => {
        const outcome = commandOutcome(result);
        return outcome === null ? display : `${display} · ${outcome}`;
      },
    },
    Effect.gen(function* () {
      const subprocess = yield* Subprocess;
      const workingDirectory = yield* UpgradeWorkingDirectory;
      const result = yield* subprocess.run(executable, args, {
        ...options,
        cwd: workingDirectory.path,
      });
      records.push(commandRecord(purpose, executable, args, result));
      return result;
    }),
  );
};

const normalizedOwnershipPath = (value: string): string =>
  value.replace(/\\/gu, "/").replace(/\/+$/u, "").toLowerCase();

const isInsideRoot = (candidate: string, root: string): boolean => {
  const normalizedCandidate = normalizedOwnershipPath(candidate);
  const normalizedRoot = normalizedOwnershipPath(root);
  return (
    normalizedRoot.length > 0 &&
    (normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`))
  );
};

export const resolveAmbiguousPackageManager = (
  method: InstallMethodType,
  records: Array<CommandRecord>,
) =>
  Effect.gen(function* () {
    if (
      method._tag !== "Unknown" ||
      method.reason !== "ambiguous" ||
      !(method.evidence ?? []).some((evidence) => evidence.includes("node_modules"))
    ) {
      return method;
    }

    const modulePath = fileURLToPath(import.meta.url);
    const npmRoot = yield* runRecorded(records, "detection", "npm", ["root", "-g"], {
      timeoutMs: 5_000,
    });
    const pnpmRoot = yield* runRecorded(records, "detection", "pnpm", ["root", "-g"], {
      timeoutMs: 5_000,
    });
    const yarnRoot = yield* runRecorded(records, "detection", "yarn", ["global", "dir"], {
      timeoutMs: 5_000,
    });
    const matches: Array<"npm" | "pnpm" | "yarn"> = [];
    if (npmRoot?.exitCode === 0 && isInsideRoot(modulePath, npmRoot.stdout.trim())) {
      matches.push("npm");
    }
    if (pnpmRoot?.exitCode === 0 && isInsideRoot(modulePath, pnpmRoot.stdout.trim())) {
      matches.push("pnpm");
    }
    if (
      yarnRoot?.exitCode === 0 &&
      isInsideRoot(modulePath, `${yarnRoot.stdout.trim()}/node_modules`)
    ) {
      matches.push("yarn");
    }

    if (matches.length === 0) return method;
    if (matches.length > 1) {
      return new Unknown({
        reason: "conflicting",
        detectionSource: "conflicting",
        evidence: matches.map((manager) => `package-manager-query:${manager}`),
        confidence: "low",
      });
    }

    const matchedManager = matches[0];
    if (matchedManager === undefined) return method;
    const fields = {
      importUrl: import.meta.url,
      detectionSource: "package-manager-query" as const,
      evidence: [`package-manager-query:${matchedManager}`],
      confidence: "high" as const,
      ...(process.argv[1] !== undefined &&
      normalizedOwnershipPath(process.argv[1]).includes("/axm.sh/")
        ? { managerOwnedExecutable: process.argv[1] }
        : {}),
    };
    switch (matchedManager) {
      case "npm":
        return new Npm(fields);
      case "pnpm":
        return new Pnpm(fields);
      case "yarn": {
        const version = yield* runRecorded(records, "detection", "yarn", ["--version"], {
          timeoutMs: 5_000,
        });
        const majorText = version?.stdout.trim().split(".")[0];
        const managerMajorVersion =
          majorText !== undefined && /^\d+$/u.test(majorText) ? Number(majorText) : undefined;
        return new Yarn({
          ...fields,
          ...(managerMajorVersion === undefined ? {} : { managerMajorVersion }),
        });
      }
    }
  });

const reportedVersion = (result: CommandResult | null): string | null => {
  if (result === null || result.exitCode !== 0) return null;
  const candidate = result.stdout.trim();
  return semver.valid(candidate);
};

const declaredContentLength = (headers: Readonly<Record<string, string>>): number | undefined => {
  const declared = Number(headers["content-length"] ?? "");
  return Number.isFinite(declared) && declared > 0 ? declared : undefined;
};

/**
 * Read a release asset. `reportProgress` streams the body and publishes
 * throttled byte measurements for the unit in progress, so the one download
 * long enough to be worth watching is watchable; everything else reads the
 * body whole.
 */
const fetchAsset = (
  httpClient: HttpClient.HttpClient,
  url: string,
  options?: { readonly reportProgress?: boolean },
) =>
  Effect.gen(function* () {
    const response = yield* httpClient
      .get(url, {
        headers: { Accept: "application/octet-stream", "User-Agent": "axm-cli" },
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new UpgradeFailed({
              category: "network",
              detail: "Release asset download did not complete",
              suggestions: [{ description: "Check the network connection and retry." }],
              cause,
            }),
        ),
        Effect.timeoutOrElse({
          duration: "60 seconds",
          orElse: () =>
            Effect.fail(
              new UpgradeFailed({
                category: "network",
                detail: "Release asset download timed out",
              }),
            ),
        }),
      );
    if (response.status !== 200) {
      return yield* new UpgradeFailed({
        category: "unavailable",
        detail: `Release asset is temporarily unavailable (status ${String(response.status)})`,
        suggestions: [{ description: "Try again after release publication completes." }],
      });
    }
    const readFailed = (cause: unknown) =>
      new UpgradeFailed({
        category: "network",
        detail: "Failed to read the release asset",
        cause,
      });
    if (options?.reportProgress !== true) {
      const body = yield* response.arrayBuffer.pipe(Effect.mapError(readFailed));
      return new Uint8Array(body);
    }

    const total = declaredContentLength(response.headers);
    const report = yield* makeThrottledUnitProgress({ unit: "bytes", intervalMs: 250 });
    const chunks: Array<Uint8Array> = [];
    let received = 0;
    yield* response.stream.pipe(
      Stream.runForEach((chunk) => {
        chunks.push(chunk);
        received += chunk.length;
        return report(received, total);
      }),
      Effect.mapError(readFailed),
    );
    const body = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
    return body;
  });

export const parseChecksum = (manifest: string, binaryName: string) =>
  Effect.gen(function* () {
    const entries = manifest
      .split(/\r?\n/u)
      .filter((line) => line.length > 0)
      .map((line) => /^([0-9a-f]{64}) {2}([A-Za-z0-9._-]+)$/u.exec(line));
    if (entries.some((entry) => entry === null)) {
      return yield* new UpgradeFailed({
        category: "validation",
        detail: "SHA256SUMS contains a malformed entry",
      });
    }
    const matches = entries.filter((entry) => entry?.[2] === binaryName);
    if (matches.length !== 1 || matches[0]?.[1] === undefined) {
      return yield* new UpgradeFailed({
        category: "validation",
        detail: `SHA256SUMS must contain exactly one entry for ${binaryName}`,
      });
    }
    return matches[0][1];
  });

const verifyExactVersion = (
  records: Array<CommandRecord>,
  purpose: CommandRecord["purpose"],
  binaryPath: string,
  expectedVersion: string | null,
) =>
  Effect.gen(function* () {
    const result = yield* runRecorded(records, purpose, binaryPath, ["--version"], {
      timeoutMs: 10_000,
    });
    const version = reportedVersion(result);
    return {
      exact:
        result !== null &&
        result.exitCode === 0 &&
        (expectedVersion === null || version === expectedVersion),
      version,
      result,
    };
  });

const LockDataSchema = Schema.Struct({
  pid: Schema.Number,
  targetPath: Schema.String,
  backupPath: Schema.NullOr(Schema.String),
});
type LockData = typeof LockDataSchema.Type;
const decodeLock = Schema.decodeUnknownEffect(Schema.fromJsonString(LockDataSchema));

const ownerIsActive = (pid: number) =>
  Effect.sync(() => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return Reflect.get(Object(error), "code") !== "ESRCH";
    }
  });

type LockResult = { readonly acquired: true; readonly path: string } | { readonly acquired: false };

const acquireUpgradeLock = (targetPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const lockPath = `${targetPath}.upgrade.lock`;
    const initial: LockData = { pid: process.pid, targetPath, backupPath: null };
    const write = fs.writeFileString(lockPath, `${JSON.stringify(initial)}\n`, { flag: "wx" });
    if (
      yield* write.pipe(
        Effect.as(true),
        Effect.catch(() => Effect.succeed(false)),
      )
    ) {
      return { acquired: true, path: lockPath } satisfies LockResult;
    }

    const existing = yield* fs
      .readFileString(lockPath)
      .pipe(Effect.flatMap(decodeLock), Effect.option);
    if (Option.isNone(existing) || (yield* ownerIsActive(existing.value.pid))) {
      return { acquired: false } satisfies LockResult;
    }

    if (
      existing.value.backupPath !== null &&
      !(yield* fs.exists(existing.value.targetPath)) &&
      (yield* fs.exists(existing.value.backupPath))
    ) {
      yield* fs.rename(existing.value.backupPath, existing.value.targetPath);
    }
    yield* fs.remove(lockPath);
    if (
      yield* write.pipe(
        Effect.as(true),
        Effect.catch(() => Effect.succeed(false)),
      )
    ) {
      return { acquired: true, path: lockPath } satisfies LockResult;
    }
    return { acquired: false } satisfies LockResult;
  });

const updateLockBackup = (lockPath: string, targetPath: string, backupPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const data: LockData = { pid: process.pid, targetPath, backupPath };
    yield* fs.writeFileString(lockPath, `${JSON.stringify(data)}\n`);
  });

export const handleScript = (
  input: BaseResultInput,
  method: Extract<InstallMethodType, { readonly _tag: "Script" }>,
  binary: PlatformBinaryInfo,
  release: { readonly binaryAssetUrl: string; readonly checksumAssetUrl: string },
) =>
  Effect.gen(function* () {
    if (semver.valid(input.targetVersion) === null) {
      return yield* new UpgradeFailed({
        category: "validation",
        detail: "The selected upgrade target is not valid semantic version",
      });
    }

    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const httpClient = yield* HttpClient.HttpClient;
    const recorder = yield* InstallationRecorder;
    const records: Array<CommandRecord> = [...input.detectionCommands];
    const targetPath = yield* fs
      .realPath(method.execPath)
      .pipe(Effect.catch(() => Effect.succeed(method.execPath)));
    const scriptBaseResult = () => ({
      ...upgradeBaseFacts(input),
      executablePath: targetPath,
    });
    const lock = yield* acquireUpgradeLock(targetPath);
    if (!lock.acquired) {
      return noMutationResult(input, "manual-action-required", recommended("axm", ["upgrade"]), [
        "Another upgrade owns the installed executable lock.",
      ]);
    }

    return yield* Effect.ensuring(
      Effect.gen(function* () {
        const [binaryBytes, manifestBytes] = yield* Effect.all([
          observeChildUnit(
            { id: "download-binary", label: `Download ${binary.binaryName}` },
            fetchAsset(httpClient, release.binaryAssetUrl, { reportProgress: true }),
          ),
          fetchAsset(httpClient, release.checksumAssetUrl),
        ]);
        const manifest = new TextDecoder("utf-8", { fatal: false }).decode(manifestBytes);
        const expectedHash = yield* parseChecksum(manifest, binary.binaryName);
        const actualHash = createHash("sha256").update(binaryBytes).digest("hex");
        if (actualHash !== expectedHash) {
          return yield* new UpgradeFailed({
            category: "validation",
            detail: `Checksum mismatch for ${binary.binaryName}`,
            suggestions: [
              { description: "Retry after confirming the release assets are complete." },
            ],
          });
        }

        const targetDirectory = path.dirname(targetPath);
        // Deliberately not `writeFileAtomic` (the CLI utils module): the
        // upgrade transaction keeps the temp binary as a standalone artifact
        // between write and rename so it can be chmod'ed, executed to verify
        // the exact version, and swapped in only after a restorable backup
        // exists. Collapsing write+rename into one step would weaken rollback.
        const tempPath = yield* fs.makeTempFile({
          directory: targetDirectory,
          prefix: ".axm-upgrade-",
          suffix: process.platform === "win32" ? ".exe" : ".tmp",
        });
        const tempDirectory = path.dirname(tempPath);
        const now = yield* Clock.currentTimeMillis;
        const backupPath = path.join(
          targetDirectory,
          `.axm-backup-${String(process.pid)}-${String(now)}${process.platform === "win32" ? ".exe" : ""}`,
        );
        let replacementStarted = false;

        return yield* Effect.ensuring(
          Effect.gen(function* () {
            const prepared = yield* Effect.gen(function* () {
              yield* fs.writeFile(tempPath, binaryBytes);
              if (process.platform !== "win32") yield* fs.chmod(tempPath, 0o755);
            }).pipe(
              Effect.as(true),
              Effect.catch(() => Effect.succeed(false)),
            );
            if (!prepared) {
              return {
                ...scriptBaseResult(),
                resultStatus: "upgrade-incomplete",
                reportedVersion: input.localVersion,
                verification: "not-attempted",
                mutationState: "not-attempted",
                verificationExecutables: [],
                executedCommands: records,
                recommendedCommand: recoveryInstaller(input.targetVersion),
                details: ["The downloaded binary could not be prepared in the install directory."],
                backupPath: null,
              } satisfies UpgradeCoreResult;
            }

            const temporary = yield* verifyExactVersion(
              records,
              "verification",
              tempPath,
              input.targetVersion,
            );
            if (!temporary.exact) {
              return yield* new UpgradeFailed({
                category: "validation",
                detail: `Downloaded binary did not report expected version ${input.targetVersion}`,
              });
            }

            const backupCreated = yield* Effect.gen(function* () {
              if (process.platform === "win32") {
                yield* updateLockBackup(lock.path, targetPath, backupPath);
                replacementStarted = true;
                yield* fs.rename(targetPath, backupPath);
              } else {
                yield* fs.copyFile(targetPath, backupPath);
                yield* updateLockBackup(lock.path, targetPath, backupPath);
                replacementStarted = true;
              }
            }).pipe(
              Effect.as(true),
              Effect.catch(() => Effect.succeed(false)),
            );
            if (!backupCreated) {
              return {
                ...scriptBaseResult(),
                resultStatus: "upgrade-incomplete",
                reportedVersion: input.localVersion,
                verification: "not-attempted",
                mutationState: "not-attempted",
                verificationExecutables: [],
                executedCommands: records,
                recommendedCommand: recoveryInstaller(input.targetVersion),
                details: [
                  "AXM could not create a restorable backup; no replacement was attempted.",
                ],
                backupPath: null,
              } satisfies UpgradeCoreResult;
            }

            const replaced = yield* fs.rename(tempPath, targetPath).pipe(
              Effect.as(true),
              Effect.catch(() => Effect.succeed(false)),
            );
            if (!replaced) {
              const restored = yield* fs.rename(backupPath, targetPath).pipe(
                Effect.as(true),
                Effect.catch(() => Effect.succeed(false)),
              );
              if (!restored) {
                return yield* new UpgradeFailed({
                  category: "internal",
                  detail: `AXM replacement and rollback failed; recoverable backup: ${backupPath}`,
                });
              }
              replacementStarted = false;
              return {
                ...scriptBaseResult(),
                resultStatus: "rolled-back",
                reportedVersion: input.localVersion,
                verification: "not-attempted",
                mutationState: "rolled-back",
                verificationExecutables: [],
                executedCommands: records,
                recommendedCommand: recoveryInstaller(input.targetVersion),
                details: ["Replacement failed and the original executable was restored."],
                backupPath: null,
              } satisfies UpgradeCoreResult;
            }

            const installed = yield* verifyExactVersion(
              records,
              "verification",
              targetPath,
              input.targetVersion,
            );
            if (!installed.exact) {
              const rollback = yield* Effect.gen(function* () {
                yield* fs.remove(targetPath).pipe(Effect.ignore);
                yield* fs.rename(backupPath, targetPath);
                return yield* verifyExactVersion(
                  records,
                  "rollback",
                  targetPath,
                  input.localVersion,
                );
              }).pipe(Effect.option);
              if (Option.isNone(rollback) || !rollback.value.exact) {
                return yield* new UpgradeFailed({
                  category: "internal",
                  detail: `AXM verification and rollback failed; recoverable backup: ${backupPath}`,
                });
              }
              replacementStarted = false;
              return {
                ...scriptBaseResult(),
                resultStatus: "rolled-back",
                reportedVersion: rollback.value.version,
                verification: "mismatch",
                mutationState: "rolled-back",
                verificationExecutables: [
                  {
                    role: "invoked",
                    path: targetPath,
                    reportedVersion: installed.version,
                    exitCode: installed.result?.exitCode ?? null,
                  },
                ],
                executedCommands: records,
                recommendedCommand: recoveryInstaller(input.targetVersion),
                details: ["The installed binary failed verification; the original was restored."],
                backupPath: null,
              } satisfies UpgradeCoreResult;
            }

            const metadata = yield* recorder.record(input.method, targetPath).pipe(
              Effect.as(true),
              Effect.catch(() => Effect.succeed(false)),
            );
            if (!metadata) {
              return {
                ...scriptBaseResult(),
                resultStatus: "upgrade-incomplete",
                reportedVersion: installed.version,
                verification: "verified",
                mutationState: "updated",
                verificationExecutables: [
                  {
                    role: "invoked",
                    path: targetPath,
                    reportedVersion: installed.version,
                    exitCode: installed.result?.exitCode ?? null,
                  },
                ],
                executedCommands: records,
                recommendedCommand: recoveryInstaller(input.targetVersion),
                details: ["AXM was updated, but install metadata could not be persisted."],
                backupPath,
              } satisfies UpgradeCoreResult;
            }

            yield* fs.remove(backupPath).pipe(Effect.ignore);
            replacementStarted = false;
            return {
              ...scriptBaseResult(),
              resultStatus:
                input.relation === "current" && input.reinstall ? "reinstalled" : "upgraded",
              reportedVersion: installed.version,
              verification: "verified",
              mutationState: "updated",
              verificationExecutables: [
                {
                  role: "invoked",
                  path: targetPath,
                  reportedVersion: installed.version,
                  exitCode: installed.result?.exitCode ?? null,
                },
              ],
              executedCommands: records,
              recommendedCommand: null,
              details: [],
              backupPath: null,
            } satisfies UpgradeCoreResult;
          }).pipe(
            Effect.onInterrupt(() =>
              replacementStarted
                ? Effect.gen(function* () {
                    yield* fs.remove(targetPath).pipe(Effect.ignore);
                    yield* fs.rename(backupPath, targetPath).pipe(Effect.ignore);
                  })
                : Effect.void,
            ),
          ),
          fs.remove(tempDirectory, { recursive: true }).pipe(Effect.ignore),
        );
      }),
      fs.remove(lock.path).pipe(Effect.ignore),
    );
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof UpgradeFailed
        ? cause
        : new UpgradeFailed({
            category: "internal",
            detail: "The transactional AXM replacement could not complete",
            suggestions: [{ description: "Check install-directory permissions and retry." }],
            cause,
          }),
    ),
  );

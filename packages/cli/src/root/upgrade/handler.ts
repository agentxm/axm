import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as semver from "semver";

import { AppError, makeAppError } from "@agentxm/client-core/unstable/app-error";
import { Verbosity } from "@agentxm/client-core/unstable/cli-flags";
import {
  setCommandSemanticProperties,
  summarizeCommandOutcome,
  type SuggestedAction,
} from "@agentxm/client-core/unstable/cli-runtime";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { InstallMeta } from "@agentxm/client-core/unstable/install-meta";
import {
  InstallMethod,
  Npm,
  Pnpm,
  Unknown,
  Yarn,
  type DetectionSource,
  type InstallMethodName,
  type InstallMethodType,
} from "@agentxm/client-core/unstable/install-method";
import {
  DEFAULT_GITHUB_REPO,
  resolveLatestVersion,
  type VersionRelation,
} from "@agentxm/client-core/unstable/version-resolution";
import { loadVersion } from "../../version.js";
import { Subprocess, type CommandResult, type RunCommandOptions } from "./subprocess.js";

export interface UpgradeHandlerArgs {
  readonly reinstall: boolean;
  /** Test/internal override for an observed local version. */
  readonly localVersion?: string | null;
}

const ResultStatusSchema = Schema.Literals([
  "upgraded",
  "reinstalled",
  "already-up-to-date",
  "local-newer",
  "downgrade-refused",
  "upgrade-incomplete",
  "upgrade-unverified",
  "manual-action-required",
  "rolled-back",
] as const);
export type ResultStatus = typeof ResultStatusSchema.Type;

const InstallMethodSchema = Schema.Literals([
  "script",
  "homebrew",
  "npm",
  "pnpm",
  "yarn",
  "unknown",
] as const);
type ResultInstallMethod = typeof InstallMethodSchema.Type;

const CommandRecordSchema = Schema.Struct({
  purpose: Schema.Literals([
    "detection",
    "preparation",
    "delegation",
    "verification",
    "rollback",
  ] as const),
  executable: Schema.String,
  args: Schema.Array(Schema.String),
  display: Schema.String,
  exitCode: Schema.NullOr(Schema.Number),
  stdout: Schema.String,
  stderr: Schema.String,
  outputTruncated: Schema.Boolean,
});
export type CommandRecord = typeof CommandRecordSchema.Type;

const RecommendedCommandSchema = Schema.Struct({
  executable: Schema.String,
  args: Schema.Array(Schema.String),
  display: Schema.String,
  shellRequired: Schema.Boolean,
});
type RecommendedCommand = typeof RecommendedCommandSchema.Type;

const VerificationExecutableSchema = Schema.Struct({
  role: Schema.Literals(["invoked", "manager-owned", "path-resolved"] as const),
  path: Schema.String,
  reportedVersion: Schema.NullOr(Schema.String),
  exitCode: Schema.NullOr(Schema.Number),
});
type VerificationExecutable = typeof VerificationExecutableSchema.Type;

const UpgradeCoreResultSchema = Schema.Struct({
  resultStatus: ResultStatusSchema,
  installMethod: InstallMethodSchema,
  detectionSource: Schema.String,
  detectionEvidence: Schema.Array(Schema.String),
  detectionConfidence: Schema.Literals(["high", "medium", "low"] as const),
  versionRelation: Schema.Literals([
    "upgrade-available",
    "current",
    "local-newer",
    "unknown-local",
  ] as const),
  localVersion: Schema.NullOr(Schema.String),
  targetVersion: Schema.NullOr(Schema.String),
  reportedVersion: Schema.NullOr(Schema.String),
  verification: Schema.Literals([
    "verified",
    "unchanged",
    "mismatch",
    "unavailable",
    "not-attempted",
  ] as const),
  mutationState: Schema.Literals([
    "not-attempted",
    "unchanged",
    "updated",
    "rolled-back",
    "unknown",
  ] as const),
  executablePath: Schema.NullOr(Schema.String),
  verificationExecutables: Schema.Array(VerificationExecutableSchema),
  executedCommands: Schema.Array(CommandRecordSchema),
  recommendedCommand: Schema.NullOr(RecommendedCommandSchema),
  delegatedCommand: Schema.NullOr(Schema.String),
  reinstall: Schema.Boolean,
  details: Schema.Array(Schema.String),
  backupPath: Schema.NullOr(Schema.String),
});
export type UpgradeCoreResult = typeof UpgradeCoreResultSchema.Type;

const UpgradePlanStepArtifactSchema = Schema.Struct({
  path: Schema.optional(Schema.String),
  scope: Schema.Literal("user"),
  version: Schema.optional(Schema.String),
  change: Schema.Literals(["updated", "unchanged", "unknown"] as const),
  previousVersion: Schema.optional(Schema.String),
});

const UpgradePlanStepSchema = Schema.Struct({
  label: Schema.String,
  status: Schema.Literals(["applied", "unchanged", "failed", "blocked"] as const),
  message: Schema.String,
  details: Schema.Array(Schema.String),
  artifact: Schema.optional(UpgradePlanStepArtifactSchema),
});
type UpgradePlanStep = typeof UpgradePlanStepSchema.Type;

export const UpgradeResultSchema = Schema.Struct({
  outcome: Schema.Literals(["applied", "no-op", "indeterminate"] as const),
  planName: Schema.String,
  planDescription: Schema.String,
  message: Schema.String,
  totalSteps: Schema.Number,
  readyCount: Schema.Number,
  warningCount: Schema.Number,
  errorCount: Schema.Number,
  appliedCount: Schema.Number,
  failedCount: Schema.Number,
  blockedCount: Schema.Number,
  steps: Schema.Array(UpgradePlanStepSchema),
  resultStatus: UpgradeCoreResultSchema.fields.resultStatus,
  installMethod: UpgradeCoreResultSchema.fields.installMethod,
  detectionSource: UpgradeCoreResultSchema.fields.detectionSource,
  detectionEvidence: UpgradeCoreResultSchema.fields.detectionEvidence,
  detectionConfidence: UpgradeCoreResultSchema.fields.detectionConfidence,
  versionRelation: UpgradeCoreResultSchema.fields.versionRelation,
  localVersion: UpgradeCoreResultSchema.fields.localVersion,
  targetVersion: UpgradeCoreResultSchema.fields.targetVersion,
  reportedVersion: UpgradeCoreResultSchema.fields.reportedVersion,
  verification: UpgradeCoreResultSchema.fields.verification,
  mutationState: UpgradeCoreResultSchema.fields.mutationState,
  executablePath: UpgradeCoreResultSchema.fields.executablePath,
  verificationExecutables: UpgradeCoreResultSchema.fields.verificationExecutables,
  executedCommands: UpgradeCoreResultSchema.fields.executedCommands,
  recommendedCommand: UpgradeCoreResultSchema.fields.recommendedCommand,
  delegatedCommand: UpgradeCoreResultSchema.fields.delegatedCommand,
  reinstall: UpgradeCoreResultSchema.fields.reinstall,
  details: UpgradeCoreResultSchema.fields.details,
  backupPath: UpgradeCoreResultSchema.fields.backupPath,
});
export type UpgradeResult = typeof UpgradeResultSchema.Type;

export const UpgradeDocumentSchema = Schema.Struct({ result: UpgradeResultSchema });
export type UpgradeDocument = typeof UpgradeDocumentSchema.Type;

const HOMEBREW_TAP = "agentxm/tap";
const NPM_PACKAGE = "axm.sh";
const HOMEBREW_ENV = { HOMEBREW_NO_AUTO_UPDATE: "1" } as const;

interface PlatformBinaryInfo {
  readonly binaryName: string;
  readonly platform: string;
  readonly arch: string;
}

const SUPPORTED_TARGETS: ReadonlyArray<PlatformBinaryInfo> = [
  { platform: "darwin", arch: "arm64", binaryName: "axm-darwin-arm64" },
  { platform: "darwin", arch: "x64", binaryName: "axm-darwin-x64" },
  { platform: "linux", arch: "arm64", binaryName: "axm-linux-arm64" },
  { platform: "linux", arch: "x64", binaryName: "axm-linux-x64" },
  { platform: "win32", arch: "x64", binaryName: "axm-windows-x64.exe" },
];

export const resolvePlatformBinary = (platform: string, arch: string) => {
  const target = SUPPORTED_TARGETS.find(
    (candidate) => candidate.platform === platform && candidate.arch === arch,
  );
  return target === undefined ? Option.none<PlatformBinaryInfo>() : Option.some(target);
};

export const makeDownloadUrl = (repo: string, version: string, binaryName: string) =>
  `https://github.com/${repo}/releases/download/cli-v${version}/${binaryName}`;

const displayArgument = (argument: string): string =>
  /^[A-Za-z0-9_./:@=-]+$/u.test(argument) ? argument : `'${argument.replaceAll("'", "'\\''")}'`;

const displayCommand = (executable: string, args: ReadonlyArray<string>): string =>
  [executable, ...args].map(displayArgument).join(" ");

const recommended = (
  executable: string,
  args: ReadonlyArray<string>,
  shellRequired = false,
  display = displayCommand(executable, args),
): RecommendedCommand => ({
  executable,
  args: [...args],
  display,
  shellRequired,
});

const recoveryInstaller = (targetVersion: string): RecommendedCommand => {
  if (process.platform === "win32") {
    const display = `$env:AXM_INSTALL_VERSION='${targetVersion}'; irm https://axm.sh/install.ps1 | iex`;
    return recommended("powershell", ["-Command", display], true, display);
  }
  const display = `curl -fsSL https://axm.sh/install.sh | AXM_INSTALL_VERSION=${targetVersion} sh`;
  return recommended("sh", ["-c", display], true, display);
};

const methodName = (method: InstallMethodType): ResultInstallMethod => {
  switch (method._tag) {
    case "Script":
      return "script";
    case "Homebrew":
      return "homebrew";
    case "Npm":
      return "npm";
    case "Pnpm":
      return "pnpm";
    case "Yarn":
      return "yarn";
    case "Unknown":
      return "unknown";
  }
};

const methodLabel = (method: ResultInstallMethod): string => {
  switch (method) {
    case "script":
      return "the AXM installer";
    case "homebrew":
      return "Homebrew";
    case "npm":
      return "npm";
    case "pnpm":
      return "pnpm";
    case "yarn":
      return "Yarn";
    case "unknown":
      return "an unknown installer";
  }
};

const methodExecutablePath = (method: InstallMethodType): string | null => {
  switch (method._tag) {
    case "Script":
    case "Homebrew":
      return method.execPath;
    case "Npm":
    case "Pnpm":
    case "Yarn":
      return method.managerOwnedExecutable ?? null;
    case "Unknown":
      return null;
  }
};

interface DetectionResult {
  readonly installMethod: ResultInstallMethod;
  readonly detectionSource: DetectionSource;
  readonly detectionEvidence: ReadonlyArray<string>;
  readonly detectionConfidence: "high" | "medium" | "low";
  readonly executablePath: string | null;
}

const detectionResult = (method: InstallMethodType): DetectionResult => ({
  installMethod: methodName(method),
  detectionSource: method.detectionSource ?? "unknown",
  detectionEvidence: method.evidence ?? [],
  detectionConfidence: method.confidence ?? "low",
  executablePath: methodExecutablePath(method),
});

type UpgradeAction = "noop-current" | "noop-newer" | "refuse" | "mutate" | "manual";

export const decideUpgrade = (
  relation: VersionRelation,
  reinstall: boolean,
  supportedMethod: boolean,
): UpgradeAction => {
  if (relation === "local-newer") return reinstall ? "refuse" : "noop-newer";
  if (relation === "current" && !reinstall) return "noop-current";
  return supportedMethod ? "mutate" : "manual";
};

const supportedMethod = (method: InstallMethodType): boolean =>
  method._tag !== "Unknown" && (method._tag !== "Yarn" || method.supported);

interface BaseResultInput {
  readonly method: InstallMethodType;
  readonly detectionCommands: ReadonlyArray<CommandRecord>;
  readonly relation: VersionRelation;
  readonly localVersion: string | null;
  readonly targetVersion: string;
  readonly reinstall: boolean;
}

const baseResult = (input: BaseResultInput) => ({
  ...detectionResult(input.method),
  versionRelation: input.relation,
  localVersion: input.localVersion,
  targetVersion: input.targetVersion,
  reinstall: input.reinstall,
});

const noMutationResult = (
  input: BaseResultInput,
  resultStatus:
    "already-up-to-date" | "local-newer" | "downgrade-refused" | "manual-action-required",
  recommendation: RecommendedCommand | null,
  details: ReadonlyArray<string> = [],
): UpgradeCoreResult => ({
  ...baseResult(input),
  resultStatus,
  reportedVersion: input.localVersion,
  verification:
    resultStatus === "manual-action-required" || resultStatus === "downgrade-refused"
      ? "not-attempted"
      : "verified",
  mutationState: "not-attempted",
  verificationExecutables: [],
  executedCommands: [...input.detectionCommands],
  recommendedCommand: recommendation,
  delegatedCommand:
    resultStatus === "manual-action-required" ? (recommendation?.display ?? null) : null,
  details,
  backupPath: null,
});

const resolveGithubRepo = () =>
  Effect.orDie(
    Config.string("AXM_INSTALL_GITHUB_REPO").pipe(Config.withDefault(DEFAULT_GITHUB_REPO)),
  );

const resolveGithubApiBase = () =>
  Effect.orDie(
    Config.string("AXM_UPGRADE_GITHUB_API_URL").pipe(Config.withDefault("https://api.github.com")),
  );

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
  exitCode: result?.exitCode ?? null,
  stdout: result?.stdout ?? "",
  stderr: result?.stderr ?? failureDetail,
  outputTruncated: result?.stdoutTruncated === true || result?.stderrTruncated === true,
});

const runRecorded = (
  records: Array<CommandRecord>,
  purpose: CommandRecord["purpose"],
  executable: string,
  args: ReadonlyArray<string>,
  options?: RunCommandOptions,
) =>
  Effect.gen(function* () {
    const subprocess = yield* Subprocess;
    const attempted = yield* subprocess.run(executable, args, options).pipe(
      Effect.map((result) => ({ result, failure: "" })),
      Effect.catch((error) => Effect.succeed({ result: null, failure: error.detail })),
    );
    records.push(commandRecord(purpose, executable, args, attempted.result, attempted.failure));
    return attempted.result;
  });

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

const resolveAmbiguousPackageManager = (method: InstallMethodType, records: Array<CommandRecord>) =>
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
          supported: managerMajorVersion === 1,
        });
      }
    }
  });

const packageManagerCommand = (
  method: InstallMethodType,
  targetVersion: string,
  reinstall: boolean,
): RecommendedCommand | null => {
  switch (method._tag) {
    case "Homebrew":
      return recommended("brew", [reinstall ? "reinstall" : "upgrade", "agentxm/tap/axm"]);
    case "Npm":
      return recommended("npm", ["install", "-g", `${NPM_PACKAGE}@${targetVersion}`]);
    case "Pnpm":
      return recommended("pnpm", ["add", "-g", `${NPM_PACKAGE}@${targetVersion}`]);
    case "Yarn":
      return method.supported
        ? recommended("yarn", ["global", "add", `${NPM_PACKAGE}@${targetVersion}`])
        : null;
    case "Script":
    case "Unknown":
      return null;
  }
};

const reportedVersion = (result: CommandResult | null): string | null => {
  if (result === null || result.exitCode !== 0) return null;
  const candidate = result.stdout.trim();
  return semver.valid(candidate);
};

interface VerificationResult {
  readonly verification: UpgradeCoreResult["verification"];
  readonly reportedVersion: string | null;
  readonly mutationState: UpgradeCoreResult["mutationState"];
  readonly executables: ReadonlyArray<VerificationExecutable>;
}

const verifyDelegated = (
  method: InstallMethodType,
  localVersion: string | null,
  targetVersion: string,
  records: Array<CommandRecord>,
) =>
  Effect.gen(function* () {
    const managerPath = method.managerOwnedExecutable;
    const checks: Array<VerificationExecutable> = [];

    if (managerPath !== undefined) {
      const result = yield* runRecorded(records, "verification", managerPath, ["--version"], {
        timeoutMs: 10_000,
      });
      checks.push({
        role: "manager-owned",
        path: managerPath,
        reportedVersion: reportedVersion(result),
        exitCode: result?.exitCode ?? null,
      });
    }

    if (managerPath !== "axm") {
      const result = yield* runRecorded(records, "verification", "axm", ["--version"], {
        timeoutMs: 10_000,
      });
      checks.push({
        role: "path-resolved",
        path: "axm",
        reportedVersion: reportedVersion(result),
        exitCode: result?.exitCode ?? null,
      });
    }

    const observed = checks.map((check) => check.reportedVersion);
    if (observed.length === 0 || observed.some((version) => version === null)) {
      return {
        verification: "unavailable",
        reportedVersion: observed.find((version) => version !== null) ?? null,
        mutationState: "unknown",
        executables: checks,
      } satisfies VerificationResult;
    }
    const first = observed[0] ?? null;
    if (observed.some((version) => version !== first)) {
      return {
        verification: "mismatch",
        reportedVersion: first,
        mutationState: "updated",
        executables: checks,
      } satisfies VerificationResult;
    }
    if (first === targetVersion) {
      return {
        verification: "verified",
        reportedVersion: first,
        mutationState: "updated",
        executables: checks,
      } satisfies VerificationResult;
    }
    if (first === localVersion) {
      return {
        verification: "unchanged",
        reportedVersion: first,
        mutationState: "unchanged",
        executables: checks,
      } satisfies VerificationResult;
    }
    return {
      verification: "mismatch",
      reportedVersion: first,
      mutationState: "updated",
      executables: checks,
    } satisfies VerificationResult;
  });

const persistMetadata = (method: InstallMethodType, executablePath: string | null) =>
  Effect.gen(function* () {
    const installMeta = yield* InstallMeta;
    const name = methodName(method);
    if (name === "unknown") return;
    const managerMajorVersion = method._tag === "Yarn" ? method.managerMajorVersion : undefined;
    yield* installMeta.write({
      method: name satisfies InstallMethodName,
      installedAt: yield* DateTime.now,
      packageName: name === "npm" || name === "pnpm" || name === "yarn" ? NPM_PACKAGE : undefined,
      managerMajorVersion,
      executablePath: executablePath ?? undefined,
    });
  });

const handleDelegated = (input: BaseResultInput) =>
  Effect.gen(function* () {
    const records: Array<CommandRecord> = [...input.detectionCommands];
    const reinstall = input.relation === "current" && input.reinstall;
    const command = packageManagerCommand(input.method, input.targetVersion, reinstall);
    if (command === null) {
      return noMutationResult(
        input,
        "manual-action-required",
        recoveryInstaller(input.targetVersion),
      );
    }

    if (input.method._tag === "Homebrew") {
      const tapList = yield* runRecorded(records, "detection", "brew", ["tap"], {
        env: HOMEBREW_ENV,
      });
      if (tapList === null || tapList.exitCode !== 0) {
        return {
          ...baseResult(input),
          resultStatus: "upgrade-incomplete",
          reportedVersion: input.localVersion,
          verification: "not-attempted",
          mutationState: "not-attempted",
          verificationExecutables: [],
          executedCommands: records,
          recommendedCommand: command,
          delegatedCommand: command.display,
          details: ["Homebrew ownership preparation did not complete."],
          backupPath: null,
        } satisfies UpgradeCoreResult;
      }
      const taps = tapList.stdout.split(/\r?\n/u).map((line) => line.trim());
      if (!taps.includes(HOMEBREW_TAP)) {
        const tap = yield* runRecorded(records, "preparation", "brew", ["tap", HOMEBREW_TAP], {
          env: HOMEBREW_ENV,
        });
        if (tap === null || tap.exitCode !== 0) {
          return {
            ...baseResult(input),
            resultStatus: "upgrade-incomplete",
            reportedVersion: input.localVersion,
            verification: "not-attempted",
            mutationState: "not-attempted",
            verificationExecutables: [],
            executedCommands: records,
            recommendedCommand: command,
            delegatedCommand: command.display,
            details: ["Homebrew tap preparation did not complete."],
            backupPath: null,
          } satisfies UpgradeCoreResult;
        }
      }
    }

    const delegation = yield* runRecorded(
      records,
      "delegation",
      command.executable,
      command.args,
      input.method._tag === "Homebrew" ? { env: HOMEBREW_ENV } : undefined,
    );
    if (delegation === null || delegation.exitCode !== 0) {
      return {
        ...baseResult(input),
        resultStatus: "upgrade-incomplete",
        reportedVersion: null,
        verification: "not-attempted",
        mutationState: "unknown",
        verificationExecutables: [],
        executedCommands: records,
        recommendedCommand: command,
        delegatedCommand: command.display,
        details: [
          `${methodLabel(methodName(input.method))} exited without completing the upgrade.`,
        ],
        backupPath: null,
      } satisfies UpgradeCoreResult;
    }

    const verification = yield* verifyDelegated(
      input.method,
      input.localVersion,
      input.targetVersion,
      records,
    );
    if (verification.verification !== "verified") {
      return {
        ...baseResult(input),
        resultStatus:
          verification.verification === "unavailable" ? "upgrade-unverified" : "upgrade-incomplete",
        reportedVersion: verification.reportedVersion,
        verification: verification.verification,
        mutationState: verification.mutationState,
        verificationExecutables: verification.executables,
        executedCommands: records,
        recommendedCommand: command,
        delegatedCommand: command.display,
        details: [],
        backupPath: null,
      } satisfies UpgradeCoreResult;
    }

    const metadata = yield* persistMetadata(input.method, methodExecutablePath(input.method)).pipe(
      Effect.as(true),
      Effect.catch(() => Effect.succeed(false)),
    );
    return {
      ...baseResult(input),
      resultStatus: metadata ? (reinstall ? "reinstalled" : "upgraded") : "upgrade-incomplete",
      reportedVersion: verification.reportedVersion,
      verification: "verified",
      mutationState: "updated",
      verificationExecutables: verification.executables,
      executedCommands: records,
      recommendedCommand: metadata ? null : command,
      delegatedCommand: command.display,
      details: metadata ? [] : ["AXM was updated, but install metadata could not be persisted."],
      backupPath: null,
    } satisfies UpgradeCoreResult;
  });

const fetchAsset = (httpClient: HttpClient.HttpClient, url: string) =>
  Effect.gen(function* () {
    const response = yield* httpClient
      .get(url, {
        headers: { Accept: "application/octet-stream", "User-Agent": "axm-cli" },
      })
      .pipe(
        Effect.mapError((cause) =>
          makeAppError({
            code: "network",
            detail: "Release asset download did not complete",
            suggestions: [{ description: "Check the network connection and retry." }],
            cause,
          }),
        ),
        Effect.timeoutOrElse({
          duration: "60 seconds",
          orElse: () =>
            Effect.fail(
              makeAppError({
                code: "network",
                detail: "Release asset download timed out",
              }),
            ),
        }),
      );
    if (response.status !== 200) {
      return yield* makeAppError({
        code: "unavailable",
        detail: `Release asset is temporarily unavailable (status ${String(response.status)})`,
        suggestions: [{ description: "Try again after release publication completes." }],
      });
    }
    const body = yield* response.arrayBuffer.pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "network",
          detail: "Failed to read the release asset",
          cause,
        }),
      ),
    );
    return new Uint8Array(body);
  });

export const parseChecksum = (manifest: string, binaryName: string) =>
  Effect.gen(function* () {
    const entries = manifest
      .split(/\r?\n/u)
      .filter((line) => line.length > 0)
      .map((line) => /^([0-9a-f]{64}) {2}([A-Za-z0-9._-]+)$/u.exec(line));
    if (entries.some((entry) => entry === null)) {
      return yield* makeAppError({
        code: "validation",
        detail: "SHA256SUMS contains a malformed entry",
      });
    }
    const matches = entries.filter((entry) => entry?.[2] === binaryName);
    if (matches.length !== 1 || matches[0]?.[1] === undefined) {
      return yield* makeAppError({
        code: "validation",
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

const handleScript = (
  input: BaseResultInput,
  method: Extract<InstallMethodType, { readonly _tag: "Script" }>,
  binary: PlatformBinaryInfo,
  release: { readonly binaryAssetUrl: string; readonly checksumAssetUrl: string },
) =>
  Effect.gen(function* () {
    if (semver.valid(input.targetVersion) === null) {
      return yield* makeAppError({
        code: "validation",
        detail: "The selected upgrade target is not valid semantic version",
      });
    }

    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const httpClient = yield* HttpClient.HttpClient;
    const records: Array<CommandRecord> = [...input.detectionCommands];
    const targetPath = yield* fs
      .realPath(method.execPath)
      .pipe(Effect.catch(() => Effect.succeed(method.execPath)));
    const scriptBaseResult = () => ({
      ...baseResult(input),
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
          fetchAsset(httpClient, release.binaryAssetUrl),
          fetchAsset(httpClient, release.checksumAssetUrl),
        ]);
        const manifest = new TextDecoder("utf-8", { fatal: false }).decode(manifestBytes);
        const expectedHash = yield* parseChecksum(manifest, binary.binaryName);
        const actualHash = createHash("sha256").update(binaryBytes).digest("hex");
        if (actualHash !== expectedHash) {
          return yield* makeAppError({
            code: "validation",
            detail: `Checksum mismatch for ${binary.binaryName}`,
            suggestions: [
              { description: "Retry after confirming the release assets are complete." },
            ],
          });
        }

        const targetDirectory = path.dirname(targetPath);
        // Deliberately not `writeFileAtomic` (@agentxm/client-core utils): the
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
                delegatedCommand: null,
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
              return yield* makeAppError({
                code: "validation",
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
                delegatedCommand: null,
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
                return yield* makeAppError({
                  code: "internal",
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
                delegatedCommand: null,
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
                return yield* makeAppError({
                  code: "internal",
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
                delegatedCommand: null,
                details: ["The installed binary failed verification; the original was restored."],
                backupPath: null,
              } satisfies UpgradeCoreResult;
            }

            const metadata = yield* persistMetadata(input.method, targetPath).pipe(
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
                delegatedCommand: null,
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
              delegatedCommand: null,
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
      cause instanceof AppError
        ? cause
        : makeAppError({
            code: "internal",
            detail: "The transactional AXM replacement could not complete",
            suggestions: [{ description: "Check install-directory permissions and retry." }],
            cause,
          }),
    ),
  );

const resultMessage = (result: UpgradeCoreResult): string => {
  const method = methodLabel(result.installMethod);
  switch (result.resultStatus) {
    case "upgraded":
      return result.localVersion === null
        ? `Upgraded AXM to ${result.reportedVersion ?? result.targetVersion ?? ""} via ${method}; previous version could not be determined`
        : `Upgraded AXM ${result.localVersion} → ${result.reportedVersion ?? result.targetVersion ?? ""} via ${method}`;
    case "reinstalled":
      return `Reinstalled AXM ${result.reportedVersion ?? result.targetVersion ?? ""} via ${method}`;
    case "already-up-to-date":
      return `AXM is already up to date · ${result.localVersion ?? result.targetVersion ?? ""} (${method})`;
    case "local-newer":
      return `AXM ${result.localVersion ?? ""} is newer than latest release ${result.targetVersion ?? ""}; no changes made`;
    case "downgrade-refused":
      return `Refused to replace AXM ${result.localVersion ?? ""} with older release ${result.targetVersion ?? ""}; no changes made`;
    case "manual-action-required":
      return result.installMethod === "yarn"
        ? "This Yarn release does not support global installation; no upgrade was run"
        : "Could not determine how AXM was installed; no upgrade was run";
    case "rolled-back":
      return `AXM ${result.targetVersion ?? ""} failed verification; restored AXM ${result.reportedVersion ?? "the previous version"}`;
    case "upgrade-unverified":
      return `${method} completed, but AXM could not verify the installed version · expected ${result.targetVersion ?? ""}`;
    case "upgrade-incomplete":
      if (result.verification === "unchanged") {
        return `${method} ran, but AXM still reports ${result.reportedVersion ?? ""}; expected ${result.targetVersion ?? ""}`;
      }
      if (result.verification === "mismatch") {
        return `${method} ran, but AXM reports ${result.reportedVersion ?? "a different version"}; expected ${result.targetVersion ?? ""}`;
      }
      return `${method} did not complete a verified AXM upgrade`;
  }
};

interface PlanMapping {
  readonly step: UpgradePlanStep["status"];
  readonly outcome: UpgradeResult["outcome"];
  readonly change: "updated" | "unchanged" | "unknown";
}

const planMapping = (result: UpgradeCoreResult): PlanMapping => {
  switch (result.resultStatus) {
    case "upgraded":
    case "reinstalled":
      return { step: "applied", outcome: "applied", change: "updated" };
    case "already-up-to-date":
    case "local-newer":
      return { step: "unchanged", outcome: "no-op", change: "unchanged" };
    case "downgrade-refused":
    case "manual-action-required":
      return { step: "blocked", outcome: "no-op", change: "unchanged" };
    case "rolled-back":
      return { step: "failed", outcome: "no-op", change: "unchanged" };
    case "upgrade-unverified":
      return { step: "failed", outcome: "indeterminate", change: "unknown" };
    case "upgrade-incomplete":
      if (result.mutationState === "updated") {
        return { step: "failed", outcome: "applied", change: "updated" };
      }
      if (result.mutationState === "unchanged") {
        return { step: "failed", outcome: "no-op", change: "unchanged" };
      }
      return { step: "failed", outcome: "indeterminate", change: "unknown" };
  }
};

export const withUpgradePlanFields = (result: UpgradeCoreResult): UpgradeResult => {
  const mapping = planMapping(result);
  const message = resultMessage(result);
  const artifact =
    result.executablePath === null && result.reportedVersion === null
      ? undefined
      : {
          scope: "user" as const,
          change: mapping.change,
          ...(result.executablePath === null ? {} : { path: result.executablePath }),
          ...(result.reportedVersion === null ? {} : { version: result.reportedVersion }),
          ...(result.localVersion === null ? {} : { previousVersion: result.localVersion }),
        };
  const step: UpgradePlanStep = {
    label: "AXM CLI",
    status: mapping.step,
    message,
    details: result.details,
    ...(artifact === undefined ? {} : { artifact }),
  };
  return {
    outcome: mapping.outcome,
    planName: "Upgrade AXM CLI",
    planDescription: "Update AXM through its owning installer",
    message,
    totalSteps: 1,
    readyCount: 0,
    warningCount: mapping.step === "failed" || mapping.step === "blocked" ? 1 : 0,
    errorCount: 0,
    appliedCount: mapping.step === "applied" ? 1 : 0,
    failedCount: mapping.step === "failed" ? 1 : 0,
    blockedCount: mapping.step === "blocked" ? 1 : 0,
    steps: [step],
    ...result,
  };
};

const upgradeSuggestions = (result: UpgradeCoreResult): ReadonlyArray<SuggestedAction> => {
  if (result.recommendedCommand !== null) {
    return [
      {
        description: "Next safe action",
        cmd: result.recommendedCommand.display,
      },
    ];
  }
  return [{ description: "Verify installed version", cmd: "axm --version" }];
};

const renderHuman = (result: UpgradeCoreResult) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const verbosity = yield* Verbosity;
    const quiet = verbosity.level === "quiet";
    const verbose = verbosity.isAtLeast("verbose");
    const message =
      quiet && result.recommendedCommand !== null
        ? `${resultMessage(result)} · Next: ${result.recommendedCommand.display}`
        : resultMessage(result);
    if (quiet) {
      if (
        result.resultStatus === "downgrade-refused" ||
        result.resultStatus === "upgrade-incomplete" ||
        result.resultStatus === "upgrade-unverified" ||
        result.resultStatus === "manual-action-required" ||
        result.resultStatus === "rolled-back"
      ) {
        yield* renderer.warn(message);
      }
      return;
    }
    switch (result.resultStatus) {
      case "upgraded":
      case "reinstalled":
      case "already-up-to-date":
        yield* renderer.success(message);
        break;
      case "local-newer":
        yield* renderer.info(message);
        break;
      case "downgrade-refused":
      case "upgrade-incomplete":
      case "upgrade-unverified":
      case "manual-action-required":
      case "rolled-back":
        yield* renderer.warn(message);
        break;
    }
    if (!quiet) {
      yield* Effect.forEach(result.details, (detail) => renderer.info(detail), {
        concurrency: 1,
      });
    }
    if (!quiet && result.recommendedCommand !== null) {
      yield* renderer.info(`Next: ${result.recommendedCommand.display}`);
    }
    if (verbose) {
      yield* renderer.info(`Detection: ${result.detectionSource} (${result.detectionConfidence})`);
      yield* Effect.forEach(
        result.detectionEvidence,
        (evidence) => renderer.info(`Evidence: ${evidence}`),
        { concurrency: 1 },
      );
      yield* Effect.forEach(
        result.executedCommands,
        (command) =>
          Effect.gen(function* () {
            yield* renderer.info(
              `${command.purpose}: ${command.display} · exit ${command.exitCode === null ? "unavailable" : String(command.exitCode)}${command.outputTruncated ? " · output truncated" : ""}`,
            );
            if (command.stdout.length > 0) {
              yield* renderer.info(`stdout: ${command.stdout}`);
            }
            if (command.stderr.length > 0) {
              yield* renderer.info(`stderr: ${command.stderr}`);
            }
          }),
        { concurrency: 1 },
      );
      yield* Effect.forEach(
        result.verificationExecutables,
        (verification) =>
          renderer.info(
            `Verification (${verification.role}): ${verification.path} → ${verification.reportedVersion ?? "unavailable"}`,
          ),
        { concurrency: 1 },
      );
      if (result.backupPath !== null) {
        yield* renderer.info(`Recoverable backup: ${result.backupPath}`);
      }
      if (result.resultStatus === "upgraded" || result.resultStatus === "reinstalled") {
        yield* renderer.info("Install metadata: persisted");
      }
    }
  });

export const handleUpgrade = Effect.fn("Upgrade.handle")(function* (args: UpgradeHandlerArgs) {
  const platform = resolvePlatformBinary(process.platform, process.arch);
  if (Option.isNone(platform)) {
    return yield* makeAppError({
      code: "validation",
      detail: `Unsupported platform: ${process.platform}-${process.arch}`,
      suggestions: [{ description: "Use a supported AXM platform." }],
    });
  }
  const renderer = yield* CliRenderer;

  const httpClient = yield* HttpClient.HttpClient;
  const repo = yield* resolveGithubRepo();
  const githubApiBase = yield* resolveGithubApiBase();
  const observedLocal = args.localVersion === undefined ? loadVersion() : args.localVersion;
  const localVersion = observedLocal === null ? null : semver.valid(observedLocal);
  const resolution = yield* renderer.withSpinner(
    "Checking AXM releases",
    () =>
      resolveLatestVersion(
        httpClient,
        localVersion,
        repo,
        platform.value.binaryName,
        githubApiBase,
      ),
    { successMessage: "Checked AXM releases" },
  );
  const targetVersion = resolution.targetVersion;
  if (semver.valid(targetVersion) === null) {
    return yield* makeAppError({
      code: "validation",
      detail: "The selected upgrade target is not valid semantic version",
    });
  }

  const installMethod = yield* InstallMethod;
  const detectionCommands: Array<CommandRecord> = [];
  const initiallyDetectedMethod = yield* renderer.withSpinner(
    "Detecting AXM installation method",
    () => installMethod.detect(),
    { successMessage: "Detected AXM installation method" },
  );
  const ownershipRequired =
    resolution.versionRelation !== "local-newer" &&
    !(resolution.versionRelation === "current" && !args.reinstall);
  const method = ownershipRequired
    ? yield* resolveAmbiguousPackageManager(initiallyDetectedMethod, detectionCommands)
    : initiallyDetectedMethod;
  const input: BaseResultInput = {
    method,
    detectionCommands,
    relation: resolution.versionRelation,
    localVersion: resolution.localVersion,
    targetVersion,
    reinstall: args.reinstall,
  };
  const action = decideUpgrade(resolution.versionRelation, args.reinstall, supportedMethod(method));

  const resultEffect = (() => {
    switch (action) {
      case "noop-current":
        return Effect.succeed(noMutationResult(input, "already-up-to-date", null));
      case "noop-newer":
        return Effect.succeed(noMutationResult(input, "local-newer", null));
      case "refuse":
        return Effect.succeed(noMutationResult(input, "downgrade-refused", null));
      case "manual":
        return Effect.succeed(
          noMutationResult(input, "manual-action-required", recoveryInstaller(targetVersion)),
        );
      case "mutate":
        if (method._tag === "Script") {
          const binaryAssetUrl = resolution.release.binaryAssetUrl;
          const checksumAssetUrl = resolution.release.checksumAssetUrl;
          if (binaryAssetUrl === null || checksumAssetUrl === null) {
            return Effect.fail(
              makeAppError({
                code: "unavailable",
                detail: "Selected release assets are not ready",
              }),
            );
          }
          return handleScript(input, method, platform.value, {
            binaryAssetUrl,
            checksumAssetUrl,
          });
        }
        return handleDelegated(input);
    }
  })();
  const result =
    action === "mutate"
      ? yield* renderer.withSpinner(`Upgrading AXM to ${targetVersion}`, () => resultEffect, {
          successMessage: `Finished AXM upgrade attempt for ${targetVersion}`,
        })
      : yield* resultEffect;

  const machineResult = withUpgradePlanFields(result);
  yield* setCommandSemanticProperties(
    summarizeCommandOutcome({
      outcome: machineResult.outcome === "applied" ? "applied" : "no-op",
      subjectType: "unknown",
      sourceKind: "git",
      appliedCount: machineResult.appliedCount,
      failedCount: machineResult.failedCount,
      blockedCount: machineResult.blockedCount,
    }),
  );
  if (
    yield* renderer.result({ result: machineResult }, UpgradeDocumentSchema, {
      suggestions: upgradeSuggestions(result),
      ok: machineResult.failedCount === 0 && machineResult.blockedCount === 0,
    })
  ) {
    return;
  }
  yield* renderHuman(result);
}, Effect.asVoid);

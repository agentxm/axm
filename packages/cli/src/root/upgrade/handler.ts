import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as semver from "semver";

import { AppError, makeAppError } from "../../app-error/index.js";
import { Verbosity } from "../../cli-flags/index.js";
import { setCommandSemanticProperties, summarizeCommandOutcome } from "../../cli-runtime/index.js";
import { type SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { Screen } from "../../screen/index.js";
import {
  makeThrottledUnitProgress,
  observeChildUnit,
  observeUnit,
} from "@agentxm/workspace-operations";
import { withLiveOperation } from "../shared/operation-lifecycle.js";
import { InstallMeta } from "../../install-meta/install-meta.js";
import {
  AXM_SKILL_BUNDLED_APPLY_COMMAND,
  AXM_SKILL_BUNDLED_PREVIEW_COMMAND,
} from "@agentxm/extension-workspace";
import {
  InstallMethod,
  Npm,
  Pnpm,
  Unknown,
  Yarn,
  type DetectionSource,
  type InstallMethodName,
  type InstallMethodType,
} from "../../install-method/install-method.js";
import {
  resolveExactVersion,
  resolveLatestVersion,
  type VersionResolutionResult,
  type VersionRelation,
} from "../../version-resolution/version-resolution.js";
import { loadVersion } from "../../version.js";
import { Subprocess, type CommandResult, type RunCommandOptions } from "./subprocess.js";
import { ExecutionDirectory } from "../../execution-directory.js";
import { upgradeView } from "./view.js";
import { UpdateCheck } from "../../update-check/update-check.js";

export interface UpgradeHandlerArgs {
  readonly reinstall: boolean;
  /** Optional exact stable version. Omit to use the promoted stable channel. */
  readonly requestedVersion?: string | undefined;
  /** Resolve and report the upgrade without performing it. */
  readonly preview?: boolean;
  /** Test/internal override for an observed local version. */
  readonly localVersion?: string | null;
}

const ResultStatusSchema = Schema.Literals([
  "preview",
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
  executionState: Schema.Literals(["not-started", "exited", "timed-out"] as const),
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
  phase: Schema.optional(
    Schema.Literals(["pre-mutation", "post-primary", "post-fallback"] as const),
  ),
  requestedExecutable: Schema.optional(Schema.String),
  resolvedExecutable: Schema.optional(Schema.NullOr(Schema.String)),
  queryOutcome: Schema.optional(
    Schema.Literals(["reported", "unavailable", "invalid", "not-attempted"] as const),
  ),
  reportedVersion: Schema.NullOr(Schema.String),
  exitCode: Schema.NullOr(Schema.Number),
});
type VerificationExecutable = typeof VerificationExecutableSchema.Type;

const HomebrewFailureSchema = Schema.Literals([
  "tap-query-failed",
  "tap-preparation-failed",
  "refresh-failed",
  "formula-query-failed",
  "target-formula-unavailable",
  "formula-ahead-of-target",
  "delegation-failed",
  "manager-version-unchanged",
  "manager-version-mismatch",
  "path-version-unavailable",
  "path-version-mismatch",
  "manager-path-disagreement",
] as const);
type HomebrewFailure = typeof HomebrewFailureSchema.Type;

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
  reinstall: Schema.Boolean,
  details: Schema.Array(Schema.String),
  backupPath: Schema.NullOr(Schema.String),
  homebrewFailure: Schema.optional(HomebrewFailureSchema),
  observedFormulaVersion: Schema.optional(Schema.NullOr(Schema.String)),
});
export type UpgradeCoreResult = typeof UpgradeCoreResultSchema.Type & {
  readonly availability?: InstallerAvailability;
};

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

const AxmSkillCompatibilityTargetSchema = Schema.Struct({
  cliVersion: Schema.NullOr(Schema.String),
  skillVersion: Schema.NullOr(Schema.String),
  verifyCommand: Schema.String,
  recoveryPreviewCommand: Schema.String,
  recoveryApplyCommand: Schema.String,
});

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
  axmSkillCompatibilityTarget: AxmSkillCompatibilityTargetSchema,
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
  reinstall: UpgradeCoreResultSchema.fields.reinstall,
  details: UpgradeCoreResultSchema.fields.details,
  backupPath: UpgradeCoreResultSchema.fields.backupPath,
  homebrewFailure: UpgradeCoreResultSchema.fields.homebrewFailure,
  observedFormulaVersion: UpgradeCoreResultSchema.fields.observedFormulaVersion,
});
export type UpgradeResult = typeof UpgradeResultSchema.Type;

const UpgradeDispositionSchema = Schema.Literals([
  "previewed",
  "upgraded",
  "reinstalled",
  "already-current",
  "local-newer",
  "downgrade-refused",
  "installer-lagging",
  "installer-leading",
  "installer-unavailable",
  "installer-indeterminate",
  "mutation-failed",
  "verification-failed",
  "rolled-back",
  "recovery-required",
] as const);

const InstallerAvailabilityStateSchema = Schema.Literals([
  "ready",
  "lagging",
  "leading",
  "unavailable",
  "indeterminate",
  "not-required",
] as const);

export const UpgradeAssessmentResultSchema = Schema.Struct({
  contract: Schema.Literal("axm.upgrade-assessment/v1"),
  outcome: Schema.Literals(["previewed", "applied", "no-op", "failed", "indeterminate"] as const),
  disposition: UpgradeDispositionSchema,
  message: Schema.String,
  intent: Schema.Struct({
    mode: Schema.Literals(["latest", "exact"] as const),
    requestedVersion: Schema.NullOr(Schema.String),
    reinstall: Schema.Boolean,
  }),
  platform: Schema.Struct({
    os: Schema.String,
    arch: Schema.String,
    target: Schema.String,
    binaryName: Schema.String,
  }),
  local: Schema.Struct({
    version: Schema.NullOr(Schema.String),
    relation: UpgradeCoreResultSchema.fields.versionRelation,
  }),
  ownership: Schema.Struct({
    method: InstallMethodSchema,
    source: Schema.String,
    evidence: Schema.Array(Schema.String),
    confidence: Schema.Literals(["high", "medium", "low"] as const),
    executablePath: Schema.NullOr(Schema.String),
  }),
  canonical: Schema.Struct({
    source: Schema.Literals(["stable-channel", "exact-version"] as const),
    version: Schema.String,
    channelRevision: Schema.NullOr(Schema.Number),
    validatedAt: Schema.String,
  }),
  installerAvailability: Schema.Struct({
    state: InstallerAvailabilityStateSchema,
    observedVersion: Schema.NullOr(Schema.String),
  }),
  target: Schema.Struct({
    version: Schema.String,
    releaseTag: Schema.String,
    binaryAssetUrl: Schema.NullOr(Schema.String),
    checksumAssetUrl: Schema.NullOr(Schema.String),
  }),
  mutation: Schema.Struct({
    state: UpgradeCoreResultSchema.fields.mutationState,
  }),
  verification: Schema.Struct({
    state: UpgradeCoreResultSchema.fields.verification,
    reportedVersion: Schema.NullOr(Schema.String),
    executables: Schema.Array(VerificationExecutableSchema),
  }),
  recovery: Schema.Struct({
    backupPath: Schema.NullOr(Schema.String),
    recommendedCommand: Schema.NullOr(RecommendedCommandSchema),
  }),
  commands: Schema.Array(CommandRecordSchema),
  details: Schema.Struct({
    messages: Schema.Array(Schema.String),
    homebrewFailure: Schema.NullOr(HomebrewFailureSchema),
    observedFormulaVersion: Schema.NullOr(Schema.String),
  }),
  steps: Schema.Array(UpgradePlanStepSchema),
});
export type UpgradeAssessmentResult = typeof UpgradeAssessmentResultSchema.Type;

export const UpgradeDocumentSchema = Schema.Struct({ result: UpgradeAssessmentResultSchema });
export type UpgradeDocument = typeof UpgradeDocumentSchema.Type;

const HOMEBREW_TAP = "agentxm/tap";
const HOMEBREW_FORMULA = `${HOMEBREW_TAP}/axm`;
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

export const methodLabel = (method: ResultInstallMethod): string => {
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
  details,
  backupPath: null,
});

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
  if (command !== null) return `Would run ${command.display}`;
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
const previewResult = (input: BaseResultInput, binaryName: string): UpgradeCoreResult => ({
  ...baseResult(input),
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
      const executionDirectory = yield* ExecutionDirectory;
      const result = yield* subprocess.run(executable, args, {
        ...options,
        cwd: executionDirectory.path,
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

type InstallerAvailabilityState =
  "ready" | "lagging" | "leading" | "unavailable" | "indeterminate" | "not-required";

interface InstallerAvailability {
  readonly state: InstallerAvailabilityState;
  readonly observedVersion: string | null;
  readonly details: ReadonlyArray<string>;
}

const PublishedVersionSchema = Schema.Union([
  Schema.String,
  Schema.Struct({ type: Schema.String, data: Schema.String }),
]);

const parsePublishedVersion = (stdout: string): string | null => {
  const decoded = Schema.decodeUnknownOption(Schema.fromJsonString(PublishedVersionSchema))(stdout);
  if (Option.isNone(decoded)) return null;
  const value = typeof decoded.value === "string" ? decoded.value : decoded.value.data;
  return semver.valid(value);
};

const packageAvailabilityCommand = (
  method: Extract<InstallMethodType, { readonly _tag: "Npm" | "Pnpm" | "Yarn" }>,
  targetVersion: string,
): RecommendedCommand => {
  const packageReference = `${NPM_PACKAGE}@${targetVersion}`;
  switch (method._tag) {
    case "Npm":
      return recommended("npm", ["view", packageReference, "version", "--json"]);
    case "Pnpm":
      return recommended("pnpm", ["view", packageReference, "version", "--json"]);
    case "Yarn":
      // Yarn Classic synthesizes the requested version even when it does not exist.
      // Its published version inventory establishes membership instead.
      return recommended("yarn", ["info", packageReference, "versions", "--json"]);
  }
};

const queryPackageAvailability = (
  method: Extract<InstallMethodType, { readonly _tag: "Npm" | "Pnpm" | "Yarn" }>,
  targetVersion: string,
  records: Array<CommandRecord>,
) =>
  Effect.gen(function* () {
    const command = packageAvailabilityCommand(method, targetVersion);
    const response = yield* runRecorded(records, "detection", command.executable, command.args, {
      timeoutMs: 10_000,
    });
    if (response.executionState !== "exited") {
      return {
        state: "indeterminate",
        observedVersion: null,
        details: ["The owning package manager availability query did not complete."],
      } satisfies InstallerAvailability;
    }
    if (response.exitCode !== 0) {
      const error = Schema.decodeUnknownOption(
        Schema.fromJsonString(
          Schema.Struct({
            error: Schema.Struct({
              code: Schema.String,
              summary: Schema.optional(Schema.String),
              message: Schema.optional(Schema.String),
            }),
          }),
        ),
      )(response.stdout);
      const absent =
        Option.isSome(error) &&
        ((method._tag === "Npm" &&
          ["E404", "ETARGET"].includes(error.value.error.code) &&
          error.value.error.summary?.includes(`No match found for version ${targetVersion}`) ===
            true) ||
          (method._tag === "Pnpm" &&
            error.value.error.code === "ERR_PNPM_PACKAGE_NOT_FOUND" &&
            error.value.error.message?.includes(
              `No matching version found for ${NPM_PACKAGE}@${targetVersion}`,
            ) === true));
      return {
        state: absent ? "unavailable" : "indeterminate",
        observedVersion: null,
        details: [
          absent
            ? `The owning package manager does not expose AXM ${targetVersion}; retry after publication.`
            : `Availability of AXM ${targetVersion} could not be established; resolve the recorded package manager query failure before retrying.`,
        ],
      } satisfies InstallerAvailability;
    }
    if (method._tag === "Yarn") {
      const inventory = Schema.decodeUnknownOption(
        Schema.fromJsonString(
          Schema.Struct({
            type: Schema.Literal("inspect"),
            data: Schema.Array(Schema.String),
          }),
        ),
      )(response.stdout);
      if (
        Option.isNone(inventory) ||
        inventory.value.data.some((version) => semver.valid(version) === null)
      ) {
        return {
          state: "indeterminate",
          observedVersion: null,
          details: [
            `Yarn did not return a valid published version inventory for AXM ${targetVersion}; inspect the recorded query before retrying.`,
          ],
        } satisfies InstallerAvailability;
      }
      const available = inventory.value.data.includes(targetVersion);
      return {
        state: available ? "ready" : "unavailable",
        observedVersion: available ? targetVersion : null,
        details: available
          ? []
          : [`Yarn does not expose AXM ${targetVersion}; retry after publication.`],
      } satisfies InstallerAvailability;
    }

    const observedVersion = parsePublishedVersion(response.stdout);
    if (observedVersion === null) {
      return {
        state: "indeterminate",
        observedVersion: null,
        details: ["The owning package manager returned an invalid AXM version."],
      } satisfies InstallerAvailability;
    }

    const state = observedVersion === targetVersion ? "ready" : "indeterminate";
    return {
      state,
      observedVersion,
      details:
        state === "ready"
          ? []
          : [
              `The owning package manager advertises AXM ${observedVersion}; the canonical target is ${targetVersion}.`,
            ],
    } satisfies InstallerAvailability;
  });

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

const HomebrewInfoSchema = Schema.Struct({
  formulae: Schema.Array(
    Schema.Struct({
      full_name: Schema.String,
      versions: Schema.Struct({ stable: Schema.String }),
    }),
  ),
});

interface HomebrewAvailability extends InstallerAvailability {
  readonly failure?: HomebrewFailure;
  readonly observedVersion: string | null;
  readonly details: ReadonlyArray<string>;
}

const checkHomebrewFormula = (records: Array<CommandRecord>, targetVersion: string) =>
  Effect.gen(function* () {
    const refresh = yield* runRecorded(records, "preparation", "brew", ["update"], {
      env: HOMEBREW_ENV,
    });
    if (refresh.executionState !== "exited" || refresh.exitCode !== 0) {
      return {
        state: "indeterminate",
        failure: "refresh-failed",
        observedVersion: null,
        details: [
          "Homebrew metadata refresh did not complete, so AXM did not attempt a package mutation.",
          "Resolve the recorded brew update failure, then rerun axm upgrade.",
        ],
      } satisfies HomebrewAvailability;
    }
    const query = yield* runRecorded(
      records,
      "detection",
      "brew",
      ["info", "--json=v2", HOMEBREW_FORMULA],
      { env: HOMEBREW_ENV },
    );
    const decoded =
      query.executionState === "exited" && query.exitCode === 0
        ? Schema.decodeUnknownOption(Schema.fromJsonString(HomebrewInfoSchema))(query.stdout)
        : Option.none();
    if (Option.isSome(decoded) && decoded.value.formulae.length === 0) {
      return {
        state: "unavailable",
        failure: "target-formula-unavailable",
        observedVersion: null,
        details: [
          `Homebrew does not expose the selected AXM ${targetVersion} formula; retry after publication.`,
        ],
      } satisfies HomebrewAvailability;
    }
    const formula =
      Option.isSome(decoded) && decoded.value.formulae.length === 1
        ? decoded.value.formulae[0]
        : undefined;
    const observedVersion =
      formula?.full_name === HOMEBREW_FORMULA ? semver.valid(formula.versions.stable) : null;
    if (observedVersion === null) {
      return {
        state: "indeterminate",
        failure: "formula-query-failed",
        observedVersion: null,
        details: [
          `Homebrew did not return a valid ${HOMEBREW_FORMULA} formula version after refresh.`,
          `Inspect the recorded brew info query, then retry after the query is healthy.`,
        ],
      } satisfies HomebrewAvailability;
    }
    const comparison = semver.compare(observedVersion, targetVersion);
    if (comparison === 0)
      return { state: "ready", observedVersion, details: [] } satisfies HomebrewAvailability;
    if (comparison > 0) {
      return {
        state: "leading",
        failure: "formula-ahead-of-target",
        observedVersion,
        details: [
          `Homebrew advertises AXM ${observedVersion}, which is newer than selected AXM ${targetVersion}.`,
          "The current formula cannot install this selected target; reconcile the formula and selected release before retrying.",
        ],
      } satisfies HomebrewAvailability;
    }
    return {
      state: "lagging",
      failure: "target-formula-unavailable",
      observedVersion,
      details: [
        `Homebrew advertises AXM ${observedVersion}; selected AXM ${targetVersion} is not yet available.`,
        "Retry after Homebrew formula publication completes.",
      ],
    } satisfies HomebrewAvailability;
  });

type HomebrewPhase = "pre-mutation" | "post-primary" | "post-fallback";

interface HomebrewVerification {
  readonly managerPath: string | null;
  readonly managerVersion: string | null;
  readonly pathVersion: string | null;
  readonly executables: ReadonlyArray<VerificationExecutable>;
}

const queryExecutable = (
  records: Array<CommandRecord>,
  role: "manager-owned" | "path-resolved",
  phase: HomebrewPhase,
  requestedExecutable: string,
  resolvedExecutable: string | null,
) =>
  Effect.gen(function* () {
    if (resolvedExecutable === null) {
      return {
        role,
        phase,
        path: requestedExecutable,
        requestedExecutable,
        resolvedExecutable: null,
        queryOutcome: "unavailable",
        reportedVersion: null,
        exitCode: null,
      } satisfies VerificationExecutable;
    }
    const result = yield* runRecorded(records, "verification", resolvedExecutable, ["--version"], {
      timeoutMs: 10_000,
    });
    const version = reportedVersion(result);
    return {
      role,
      phase,
      path: resolvedExecutable,
      requestedExecutable,
      resolvedExecutable,
      queryOutcome:
        result.executionState !== "exited" || result.exitCode !== 0
          ? "unavailable"
          : version === null
            ? "invalid"
            : "reported",
      reportedVersion: version,
      exitCode: result.exitCode,
    } satisfies VerificationExecutable;
  });

const verifyHomebrew = (records: Array<CommandRecord>, phase: HomebrewPhase) =>
  Effect.gen(function* () {
    const subprocess = yield* Subprocess;
    const pathService = yield* Path.Path;
    const prefix = yield* runRecorded(records, "detection", "brew", ["--prefix"], {
      env: HOMEBREW_ENV,
      timeoutMs: 10_000,
    });
    const prefixValue =
      prefix.executionState === "exited" && prefix.exitCode === 0 && prefix.stdout.trim().length > 0
        ? prefix.stdout.trim()
        : null;
    const managerPath =
      prefixValue === null
        ? null
        : pathService.join(prefixValue, "bin", process.platform === "win32" ? "axm.exe" : "axm");
    const pathResolved = yield* subprocess.resolveExecutable(
      process.platform === "win32" ? "axm.exe" : "axm",
    );
    const manager = yield* queryExecutable(
      records,
      "manager-owned",
      phase,
      "homebrew:bin/axm",
      managerPath,
    );
    const path = yield* queryExecutable(
      records,
      "path-resolved",
      phase,
      process.platform === "win32" ? "axm.exe" : "axm",
      pathResolved,
    );
    return {
      managerPath,
      managerVersion: manager.reportedVersion,
      pathVersion: path.reportedVersion,
      executables: [manager, path],
    } satisfies HomebrewVerification;
  });

const persistMetadata = (method: InstallMethodType, executablePath: string | null) =>
  Effect.gen(function* () {
    const installMeta = yield* InstallMeta;
    const name = methodName(method);
    if (name === "unknown") return;
    const managerMajorVersion = method._tag === "Yarn" ? method.managerMajorVersion : undefined;
    yield* installMeta.write({
      schemaVersion: 2,
      method: name satisfies InstallMethodName,
      installedAt: yield* DateTime.now,
      packageName: name === "npm" || name === "pnpm" || name === "yarn" ? NPM_PACKAGE : undefined,
      managerMajorVersion,
      executablePath: executablePath ?? undefined,
    });
  });

const summarizeHomebrewVerification = (
  verification: HomebrewVerification,
  baselineVersion: string | null,
  targetVersion: string,
): Pick<UpgradeCoreResult, "verification" | "reportedVersion" | "mutationState"> => {
  const observed = [verification.managerVersion, verification.pathVersion];
  if (observed.some((version) => version === null)) {
    return {
      verification: "unavailable",
      reportedVersion: verification.managerVersion ?? verification.pathVersion,
      mutationState: "unknown",
    };
  }
  if (verification.managerVersion !== verification.pathVersion) {
    return {
      verification: "mismatch",
      reportedVersion: verification.managerVersion,
      mutationState:
        verification.managerVersion === targetVersion || verification.pathVersion === targetVersion
          ? "updated"
          : "unknown",
    };
  }
  if (verification.managerVersion === targetVersion) {
    return {
      verification: "verified",
      reportedVersion: targetVersion,
      mutationState: "updated",
    };
  }
  if (verification.managerVersion === baselineVersion) {
    return {
      verification: "unchanged",
      reportedVersion: baselineVersion,
      mutationState: "unchanged",
    };
  }
  return {
    verification: "mismatch",
    reportedVersion: verification.managerVersion,
    mutationState: "unknown",
  };
};

const homebrewVerificationFailure = (
  verification: HomebrewVerification,
  baselineVersion: string | null,
  targetVersion: string,
  fallbackAttempted: boolean,
): { readonly failure: HomebrewFailure; readonly details: ReadonlyArray<string> } => {
  if (verification.managerVersion === null) {
    return {
      failure: "manager-version-mismatch",
      details: ["Homebrew's stable AXM entrypoint did not report a valid version."],
    };
  }
  if (
    verification.managerVersion === baselineVersion &&
    verification.managerVersion !== targetVersion
  ) {
    return {
      failure: "manager-version-unchanged",
      details: [
        fallbackAttempted
          ? `Homebrew upgrade and reinstall completed, but its stable AXM entrypoint still reports ${verification.managerVersion}.`
          : `Homebrew completed, but its stable AXM entrypoint still reports ${verification.managerVersion}.`,
        "Inspect brew info agentxm/tap/axm and Homebrew's linked keg before retrying.",
      ],
    };
  }
  if (verification.managerVersion !== targetVersion) {
    return {
      failure: "manager-version-mismatch",
      details: [
        `Homebrew's stable AXM entrypoint reports ${verification.managerVersion}; expected ${targetVersion}.`,
      ],
    };
  }
  if (verification.pathVersion === null) {
    return {
      failure: "path-version-unavailable",
      details: [
        `Homebrew's AXM reports ${targetVersion}, but a fresh PATH lookup could not report an AXM version.`,
        "Repair the AXM entry on PATH or open a fresh shell; AXM did not rewrite shell configuration.",
      ],
    };
  }
  if (verification.pathVersion !== verification.managerVersion) {
    return {
      failure: "manager-path-disagreement",
      details: [
        `Homebrew's AXM reports ${verification.managerVersion}, while PATH resolves AXM ${verification.pathVersion}.`,
        "Remove or relink the shadowing AXM executable shown in verification evidence.",
      ],
    };
  }
  return {
    failure: "path-version-mismatch",
    details: [`PATH-resolved AXM reports ${verification.pathVersion}; expected ${targetVersion}.`],
  };
};

const handleHomebrew = (input: BaseResultInput) =>
  Effect.gen(function* () {
    const records: Array<CommandRecord> = [...input.detectionCommands];
    const tapList = yield* runRecorded(records, "detection", "brew", ["tap"], {
      env: HOMEBREW_ENV,
    });
    if (tapList.executionState !== "exited" || tapList.exitCode !== 0) {
      return {
        ...baseResult(input),
        resultStatus: "upgrade-incomplete",
        reportedVersion: input.localVersion,
        verification: "not-attempted",
        mutationState: "not-attempted",
        verificationExecutables: [],
        executedCommands: records,
        recommendedCommand: null,
        details: [
          "Homebrew could not list installed taps, so AXM did not attempt a package mutation.",
          "Resolve the reported Homebrew failure, then rerun axm upgrade.",
        ],
        backupPath: null,
        homebrewFailure: "tap-query-failed",
        observedFormulaVersion: null,
        availability: { state: "indeterminate", observedVersion: null, details: [] },
      } satisfies UpgradeCoreResult;
    }

    const taps = tapList.stdout.split(/\r?\n/u).map((line) => line.trim());
    if (!taps.includes(HOMEBREW_TAP)) {
      const tap = yield* runRecorded(records, "preparation", "brew", ["tap", HOMEBREW_TAP], {
        env: HOMEBREW_ENV,
      });
      if (tap.executionState !== "exited" || tap.exitCode !== 0) {
        return {
          ...baseResult(input),
          resultStatus: "upgrade-incomplete",
          reportedVersion: input.localVersion,
          verification: "not-attempted",
          mutationState: "not-attempted",
          verificationExecutables: [],
          executedCommands: records,
          recommendedCommand: null,
          details: [
            `Homebrew could not prepare ${HOMEBREW_TAP}, so AXM did not attempt a package mutation.`,
            "Resolve the reported tap failure, then rerun axm upgrade.",
          ],
          backupPath: null,
          homebrewFailure: "tap-preparation-failed",
          observedFormulaVersion: null,
          availability: { state: "indeterminate", observedVersion: null, details: [] },
        } satisfies UpgradeCoreResult;
      }
    }

    const availability = yield* checkHomebrewFormula(records, input.targetVersion);
    if (availability.state !== "ready") {
      return {
        ...baseResult(input),
        resultStatus: "upgrade-incomplete",
        reportedVersion: input.localVersion,
        verification: "not-attempted",
        mutationState: "not-attempted",
        verificationExecutables: [],
        executedCommands: records,
        recommendedCommand: null,
        details: [...availability.details],
        backupPath: null,
        homebrewFailure: availability.failure,
        observedFormulaVersion: availability.observedVersion,
        availability,
      } satisfies UpgradeCoreResult;
    }

    const preMutation = yield* verifyHomebrew(records, "pre-mutation");
    const reinstall = input.relation === "current" && input.reinstall;
    const command = packageManagerCommand(input.method, input.targetVersion, reinstall);
    if (command === null) {
      return noMutationResult(
        input,
        "manual-action-required",
        recoveryInstaller(input.targetVersion),
      );
    }
    const primary = yield* runRecorded(records, "delegation", command.executable, command.args, {
      env: HOMEBREW_ENV,
    });
    if (primary.executionState === "not-started") {
      return {
        ...baseResult(input),
        resultStatus: "upgrade-incomplete",
        reportedVersion: input.localVersion,
        verification: "not-attempted",
        mutationState: "not-attempted",
        verificationExecutables: preMutation.executables,
        executedCommands: records,
        recommendedCommand: null,
        details: [
          "Homebrew did not start the selected AXM mutation.",
          "Resolve the executable or permission failure shown in command evidence, then rerun axm upgrade.",
        ],
        backupPath: null,
        homebrewFailure: "delegation-failed",
        observedFormulaVersion: availability.observedVersion,
        availability,
      } satisfies UpgradeCoreResult;
    }

    let postMutation = yield* verifyHomebrew(records, "post-primary");
    const verificationExecutables = [...preMutation.executables, ...postMutation.executables];
    const managerBaselineVersion = preMutation.managerVersion ?? input.localVersion;
    const primarySucceeded = primary.executionState === "exited" && primary.exitCode === 0;
    if (!primarySucceeded) {
      const summary = summarizeHomebrewVerification(
        postMutation,
        managerBaselineVersion,
        input.targetVersion,
      );
      return {
        ...baseResult(input),
        resultStatus: "upgrade-incomplete",
        ...summary,
        verificationExecutables,
        executedCommands: records,
        recommendedCommand: null,
        details: [
          primary.executionState === "timed-out"
            ? "Homebrew started but did not finish before the upgrade deadline."
            : "Homebrew exited without completing the selected AXM mutation.",
          "Inspect the recorded Homebrew output and verified executable state before retrying.",
        ],
        backupPath: null,
        homebrewFailure: "delegation-failed",
        observedFormulaVersion: availability.observedVersion,
        availability,
      } satisfies UpgradeCoreResult;
    }

    let fallbackAttempted = false;
    const fallbackEligible =
      !reinstall &&
      preMutation.managerVersion !== null &&
      postMutation.managerVersion === preMutation.managerVersion &&
      semver.lt(preMutation.managerVersion, input.targetVersion);
    if (fallbackEligible) {
      fallbackAttempted = true;
      const fallback = yield* runRecorded(
        records,
        "delegation",
        "brew",
        ["reinstall", HOMEBREW_FORMULA],
        { env: HOMEBREW_ENV },
      );
      if (fallback.executionState !== "not-started") {
        postMutation = yield* verifyHomebrew(records, "post-fallback");
        verificationExecutables.push(...postMutation.executables);
      }
      if (fallback.executionState !== "exited" || fallback.exitCode !== 0) {
        const summary = summarizeHomebrewVerification(
          postMutation,
          managerBaselineVersion,
          input.targetVersion,
        );
        return {
          ...baseResult(input),
          resultStatus: "upgrade-incomplete",
          ...summary,
          verificationExecutables,
          executedCommands: records,
          recommendedCommand: null,
          details: [
            "Homebrew's one-shot reinstall recovery did not complete.",
            "Inspect the recorded Homebrew output and verified executable state before retrying.",
          ],
          backupPath: null,
          homebrewFailure: "delegation-failed",
          observedFormulaVersion: availability.observedVersion,
          availability,
        } satisfies UpgradeCoreResult;
      }
    }

    const summary = summarizeHomebrewVerification(
      postMutation,
      managerBaselineVersion,
      input.targetVersion,
    );
    if (summary.verification !== "verified") {
      const failure = homebrewVerificationFailure(
        postMutation,
        managerBaselineVersion,
        input.targetVersion,
        fallbackAttempted,
      );
      return {
        ...baseResult(input),
        resultStatus:
          summary.verification === "unavailable" ? "upgrade-unverified" : "upgrade-incomplete",
        ...summary,
        verificationExecutables,
        executedCommands: records,
        recommendedCommand: null,
        details: [...failure.details],
        backupPath: null,
        homebrewFailure: failure.failure,
        observedFormulaVersion: availability.observedVersion,
        availability,
      } satisfies UpgradeCoreResult;
    }

    const metadata = yield* persistMetadata(input.method, postMutation.managerPath).pipe(
      Effect.as(true),
      Effect.catch(() => Effect.succeed(false)),
    );
    return {
      ...baseResult(input),
      executablePath: postMutation.managerPath,
      resultStatus: metadata ? (reinstall ? "reinstalled" : "upgraded") : "upgrade-incomplete",
      ...summary,
      verificationExecutables,
      executedCommands: records,
      recommendedCommand: null,
      details: metadata ? [] : ["AXM was updated, but install metadata could not be persisted."],
      backupPath: null,
      observedFormulaVersion: availability.observedVersion,
      availability,
    } satisfies UpgradeCoreResult;
  });

const handleDelegated = (input: BaseResultInput) =>
  Effect.gen(function* () {
    if (input.method._tag === "Homebrew") {
      return yield* handleHomebrew(input);
    }
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

    const delegation = yield* runRecorded(
      records,
      "delegation",
      command.executable,
      command.args,
      undefined,
    );
    if (delegation.exitCode !== 0) {
      return {
        ...baseResult(input),
        resultStatus: "upgrade-incomplete",
        reportedVersion: null,
        verification: "not-attempted",
        mutationState: "unknown",
        verificationExecutables: [],
        executedCommands: records,
        recommendedCommand: command,
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
      details: metadata ? [] : ["AXM was updated, but install metadata could not be persisted."],
      backupPath: null,
    } satisfies UpgradeCoreResult;
  });

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
    const readFailed = (cause: unknown) =>
      makeAppError({
        code: "network",
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
          return yield* makeAppError({
            code: "validation",
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
  if (result.homebrewFailure !== undefined) {
    switch (result.homebrewFailure) {
      case "target-formula-unavailable":
        return result.availability?.state === "lagging"
          ? `Homebrew formula ${result.observedFormulaVersion ?? ""} is behind selected AXM ${result.targetVersion ?? ""}; no changes made`
          : `Homebrew does not expose selected AXM ${result.targetVersion ?? ""}; no changes made`;
      case "formula-ahead-of-target":
        return `Homebrew formula ${result.observedFormulaVersion ?? ""} is ahead of selected AXM ${result.targetVersion ?? ""}; no changes made`;
      case "refresh-failed":
        return "Homebrew metadata refresh failed; no AXM upgrade was attempted";
      case "formula-query-failed":
        return "Homebrew formula availability could not be verified; no AXM upgrade was attempted";
      case "tap-query-failed":
      case "tap-preparation-failed":
        return "Homebrew ownership preparation failed; no AXM upgrade was attempted";
      case "delegation-failed":
        return `Homebrew did not complete the selected AXM ${result.targetVersion ?? ""} mutation`;
      case "manager-version-unchanged":
      case "manager-version-mismatch":
      case "path-version-unavailable":
      case "path-version-mismatch":
      case "manager-path-disagreement":
        break;
    }
  }
  if (
    result.availability !== undefined &&
    !["ready", "not-required"].includes(result.availability.state)
  ) {
    return (
      result.availability.details[0] ??
      "Installer availability could not be established; no changes made"
    );
  }
  switch (result.resultStatus) {
    case "preview":
      if (result.reinstall && result.versionRelation === "current") {
        return `Would reinstall AXM ${result.targetVersion ?? ""} via ${method}`;
      }
      return result.localVersion === null
        ? `Would install AXM ${result.targetVersion ?? ""} via ${method}; current version could not be determined`
        : `Would upgrade AXM ${result.localVersion} → ${result.targetVersion ?? ""} via ${method}`;
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
    case "preview":
      return { step: "unchanged", outcome: "no-op", change: "unchanged" };
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
    axmSkillCompatibilityTarget: {
      cliVersion: result.targetVersion,
      skillVersion: result.targetVersion,
      verifyCommand: "axm lint",
      recoveryPreviewCommand: AXM_SKILL_BUNDLED_PREVIEW_COMMAND,
      recoveryApplyCommand: AXM_SKILL_BUNDLED_APPLY_COMMAND,
    },
    ...result,
  };
};

const resultDisposition = (
  result: UpgradeCoreResult,
  availability: InstallerAvailability,
): UpgradeAssessmentResult["disposition"] => {
  if (availability.state === "lagging") return "installer-lagging";
  if (availability.state === "leading") return "installer-leading";
  if (availability.state === "unavailable") return "installer-unavailable";
  if (availability.state === "indeterminate") return "installer-indeterminate";
  switch (result.resultStatus) {
    case "preview":
      return "previewed";
    case "upgraded":
      return "upgraded";
    case "reinstalled":
      return "reinstalled";
    case "already-up-to-date":
      return "already-current";
    case "local-newer":
      return "local-newer";
    case "downgrade-refused":
      return "downgrade-refused";
    case "manual-action-required":
      return "recovery-required";
    case "rolled-back":
      return "rolled-back";
    case "upgrade-unverified":
      return "verification-failed";
    case "upgrade-incomplete":
      return result.verification === "mismatch" ? "verification-failed" : "mutation-failed";
  }
};

const assessmentOutcome = (result: UpgradeCoreResult): UpgradeAssessmentResult["outcome"] => {
  switch (result.resultStatus) {
    case "preview":
      return "previewed";
    case "upgraded":
    case "reinstalled":
      return "applied";
    case "already-up-to-date":
    case "local-newer":
      return "no-op";
    case "upgrade-unverified":
      return "indeterminate";
    case "downgrade-refused":
    case "upgrade-incomplete":
    case "manual-action-required":
    case "rolled-back":
      return "failed";
  }
};

const toUpgradeAssessment = (input: {
  readonly result: UpgradeCoreResult;
  readonly resolution: VersionResolutionResult;
  readonly platform: PlatformBinaryInfo;
  readonly requestedVersion: string | undefined;
  readonly availability: InstallerAvailability;
}): UpgradeAssessmentResult => {
  const plan = withUpgradePlanFields(input.result);
  const availability = input.result.availability ?? input.availability;
  return {
    contract: "axm.upgrade-assessment/v1",
    outcome: assessmentOutcome(input.result),
    disposition: resultDisposition(input.result, availability),
    message: resultMessage(input.result),
    intent: {
      mode: input.requestedVersion === undefined ? "latest" : "exact",
      requestedVersion: input.requestedVersion ?? null,
      reinstall: input.result.reinstall,
    },
    platform: {
      os: process.platform,
      arch: process.arch,
      target: `${input.platform.platform}-${input.platform.arch}`,
      binaryName: input.platform.binaryName,
    },
    local: {
      version: input.result.localVersion,
      relation: input.result.versionRelation,
    },
    ownership: {
      method: input.result.installMethod,
      source: input.result.detectionSource,
      evidence: input.result.detectionEvidence,
      confidence: input.result.detectionConfidence,
      executablePath: input.result.executablePath,
    },
    canonical: {
      source: input.resolution.channel === null ? "exact-version" : "stable-channel",
      version: input.resolution.targetVersion,
      channelRevision: input.resolution.channel?.revision ?? null,
      validatedAt: input.resolution.validatedAt,
    },
    installerAvailability: {
      state: availability.state,
      observedVersion: availability.observedVersion,
    },
    target: {
      version: input.resolution.targetVersion,
      releaseTag: input.resolution.release.tagName,
      binaryAssetUrl: input.resolution.release.binaryAssetUrl,
      checksumAssetUrl: input.resolution.release.checksumAssetUrl,
    },
    mutation: { state: input.result.mutationState },
    verification: {
      state: input.result.verification,
      reportedVersion: input.result.reportedVersion,
      executables: input.result.verificationExecutables,
    },
    recovery: {
      backupPath: input.result.backupPath,
      recommendedCommand: input.result.recommendedCommand,
    },
    commands: input.result.executedCommands,
    details: {
      messages: Array.from(new Set([...input.result.details, ...availability.details])),
      homebrewFailure: input.result.homebrewFailure ?? null,
      observedFormulaVersion: input.result.observedFormulaVersion ?? null,
    },
    steps: plan.steps,
  };
};

const upgradeSuggestions = (result: UpgradeCoreResult): ReadonlyArray<SuggestedAction> => {
  if (result.resultStatus === "preview") {
    return [{ description: "Perform the upgrade this preview resolved", cmd: "axm upgrade" }];
  }
  if (result.recommendedCommand !== null) {
    return [
      {
        description: "Next safe action",
        cmd: result.recommendedCommand.display,
      },
    ];
  }
  switch (result.homebrewFailure) {
    case "target-formula-unavailable":
      return [
        { description: "Retry after Homebrew publishes the selected formula", cmd: "axm upgrade" },
      ];
    case "formula-ahead-of-target":
      return [
        {
          description:
            "Reconcile the current Homebrew formula with the selected release before retrying",
        },
      ];
    case "formula-query-failed":
      return [
        {
          description: "Inspect the Homebrew formula response",
          cmd: `brew info ${HOMEBREW_FORMULA}`,
        },
      ];
    case "refresh-failed":
    case "tap-query-failed":
    case "tap-preparation-failed":
    case "delegation-failed":
      return [{ description: "Resolve the recorded Homebrew failure before retrying" }];
    case "manager-version-unchanged":
    case "manager-version-mismatch":
      return [
        {
          description: "Inspect Homebrew's installed and linked AXM state",
          cmd: `brew info ${HOMEBREW_FORMULA}`,
        },
      ];
    case "path-version-unavailable":
    case "path-version-mismatch":
    case "manager-path-disagreement":
      return [
        { description: "Reconcile the AXM executable identities shown in verification evidence" },
      ];
    case undefined:
      break;
  }
  if (
    result.resultStatus === "upgraded" ||
    result.resultStatus === "reinstalled" ||
    result.resultStatus === "already-up-to-date"
  ) {
    return [{ description: "Verify CLI and official-skill compatibility", cmd: "axm lint" }];
  }
  return [{ description: "Verify installed version", cmd: "axm --version" }];
};

const renderHuman = (result: UpgradeCoreResult) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    const verbosity = yield* Verbosity;
    yield* Effect.forEach(
      upgradeView(result, resultMessage(result), verbosity.level),
      (entry) => (entry.channel === "result" ? screen.result(entry.doc) : screen.note(entry.doc)),
      { discard: true },
    );
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
  const screen = yield* Screen;
  const observedLocal = args.localVersion === undefined ? loadVersion() : args.localVersion;
  const localVersion = observedLocal === null ? null : semver.valid(observedLocal);

  const installMethod = yield* InstallMethod;
  const preview = args.preview === true;
  const detectionCommands: Array<CommandRecord> = [];
  // Detection, channel resolution, availability, and the upgrade itself are
  // the units of one observed operation; assessment and rendering follow it.
  // Each unit that resolves a fact settles with that fact in its label, so
  // the method and the target are disclosed by the step that established
  // them rather than only by the final line.
  const upgraded = yield* withLiveOperation(
    {
      command: "upgrade",
      name: preview ? "Preview AXM upgrade" : "Upgrade AXM",
      mode: preview ? "preview" : "apply",
      ...(preview ? { successOutcome: "previewed" as const } : {}),
    },
    Effect.gen(function* () {
      // Detection and its ownership disambiguation are one unit: the probes
      // the ambiguous case runs are that unit's work, and the label it settles
      // with names the owner it actually resolved, not the first guess.
      const method = yield* observeUnit(
        {
          id: "detect-install-method",
          label: "AXM installation method",
          resolvedLabel: (resolved) =>
            resolved._tag === "Unknown"
              ? "AXM installation method — undetermined"
              : `AXM installed with ${methodLabel(methodName(resolved))}`,
        },
        Effect.gen(function* () {
          const detected = yield* installMethod.detect();
          return yield* resolveAmbiguousPackageManager(detected, detectionCommands);
        }),
      );
      if (method._tag === "Unknown") {
        return yield* makeAppError({
          code: "validation",
          detail: "Could not determine how AXM was installed",
          suggestions: [
            {
              description:
                "Reinstall AXM with the script installer, Homebrew, npm, pnpm, or Yarn Classic, then retry.",
            },
          ],
        });
      }

      const resolution =
        args.requestedVersion === undefined
          ? yield* observeUnit(
              {
                id: "resolve-channel",
                label: "AXM stable channel",
                resolvedLabel: (selected) => `AXM stable channel — ${selected.targetVersion}`,
              },
              Effect.gen(function* () {
                const httpClient = yield* HttpClient.HttpClient;
                return yield* resolveLatestVersion(
                  httpClient,
                  localVersion,
                  platform.value.binaryName,
                );
              }),
            )
          : yield* observeUnit(
              { id: "resolve-version", label: `AXM ${args.requestedVersion}` },
              resolveExactVersion(
                args.requestedVersion ?? "",
                localVersion,
                platform.value.binaryName,
              ),
            );
      const targetVersion = resolution.targetVersion;
      // A preview leaves no trace: the channel cache is durable state the
      // command was not asked to change.
      if (resolution.channel !== null && !preview) {
        const updateCheck = yield* UpdateCheck;
        yield* updateCheck.writeCache(resolution.channel, resolution.etag);
      }
      if (semver.valid(targetVersion) === null) {
        return yield* makeAppError({
          code: "validation",
          detail: "The selected upgrade target is not valid semantic version",
        });
      }

      const input: BaseResultInput = {
        method,
        detectionCommands,
        relation: resolution.versionRelation,
        localVersion: resolution.localVersion,
        targetVersion,
        reinstall: args.reinstall,
      };
      const selectedAction = decideUpgrade(
        resolution.versionRelation,
        args.reinstall,
        supportedMethod(method),
      );
      // A preview resolves ownership and the target and stops: publication
      // state is established by the run that would use it.
      const availability: InstallerAvailability =
        selectedAction !== "mutate" || preview
          ? { state: "not-required", observedVersion: null, details: [] }
          : method._tag === "Npm" || method._tag === "Pnpm" || method._tag === "Yarn"
            ? yield* observeUnit(
                { id: "availability", label: `${methodLabel(methodName(method))} availability` },
                queryPackageAvailability(method, targetVersion, detectionCommands),
              )
            : { state: "ready", observedVersion: targetVersion, details: [] };
      // The availability gate exists to stop a mutation that would fail. A
      // preview performs none, so it is not gated by publication state it
      // deliberately did not establish.
      const action =
        !preview && selectedAction === "mutate" && availability.state !== "ready"
          ? "manual"
          : selectedAction;

      if (preview && action === "mutate") {
        return {
          result: previewResult(input, platform.value.binaryName),
          resolution,
          availability,
        };
      }

      const resultEffect = (() => {
        switch (action) {
          case "noop-current":
            return Effect.succeed(noMutationResult(input, "already-up-to-date", null));
          case "noop-newer":
            return Effect.succeed(noMutationResult(input, "local-newer", null));
          case "refuse":
            return Effect.succeed(noMutationResult(input, "downgrade-refused", null));
          case "manual":
            if (selectedAction === "mutate") {
              return Effect.succeed({
                ...noMutationResult(input, "manual-action-required", null, availability.details),
                availability,
              });
            }
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
      // The mutation unit stays on screen for the whole delegation, so its
      // label carries the two facts the reader needs while it runs: what is
      // being installed and which installer is doing it. The commands the
      // installer runs nest under it.
      const result =
        action === "mutate"
          ? yield* observeUnit(
              {
                id: "upgrade",
                label: `AXM ${targetVersion} via ${methodLabel(methodName(method))}`,
              },
              resultEffect,
            )
          : yield* resultEffect;
      return { result, resolution, availability };
    }),
  );
  const { result, resolution, availability } = upgraded;

  const machineResult = toUpgradeAssessment({
    result,
    resolution,
    platform: platform.value,
    requestedVersion: args.requestedVersion,
    availability,
  });
  yield* setCommandSemanticProperties(
    summarizeCommandOutcome({
      outcome: machineResult.outcome === "applied" ? "applied" : "no-op",
      subjectType: "unknown",
      sourceKind: "git",
      appliedCount: machineResult.outcome === "applied" ? 1 : 0,
      failedCount:
        machineResult.outcome === "failed" || machineResult.outcome === "indeterminate" ? 1 : 0,
      blockedCount: machineResult.outcome === "failed" ? 1 : 0,
    }),
  );
  if (
    yield* screen.document({ result: machineResult }, UpgradeDocumentSchema, {
      suggestions: upgradeSuggestions(result),
      ok:
        machineResult.disposition === "previewed" ||
        machineResult.disposition === "upgraded" ||
        machineResult.disposition === "reinstalled" ||
        machineResult.disposition === "already-current" ||
        machineResult.disposition === "local-newer",
    })
  ) {
    return;
  }
  yield* renderHuman(result);
}, Effect.asVoid);

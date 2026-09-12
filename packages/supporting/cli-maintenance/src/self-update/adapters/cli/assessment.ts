import * as Schema from "effect/Schema";
import {
  CommandRecordSchema,
  HomebrewFailureSchema,
  InstallMethodSchema,
  RecommendedCommandSchema,
  UpgradeCoreResultSchema,
  VerificationExecutableSchema,
  type InstallerAvailability,
  type RecommendedCommand,
  type ResultInstallMethod,
  type UpgradeSettlement,
} from "../../application/index.js";

const displayArgument = (argument: string): string =>
  /^[A-Za-z0-9_./:@=-]+$/u.test(argument) ? argument : `'${argument.replaceAll("'", "'\\''")}'`;

export const formatRecommendedCommand = (command: RecommendedCommand): string => {
  const [flag, script] = command.args;
  if (
    command.shellRequired &&
    script !== undefined &&
    command.args.length === 2 &&
    ((command.executable === "sh" && flag === "-c") ||
      (command.executable === "powershell" && flag === "-Command"))
  ) {
    return script;
  }
  return [command.executable, ...command.args].map(displayArgument).join(" ");
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
    recommendedCommand: Schema.NullOr(
      Schema.Struct({
        ...RecommendedCommandSchema.fields,
        display: Schema.String,
      }),
    ),
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

const resultMessage = (
  result: UpgradeSettlement["result"],
  availability: InstallerAvailability,
): string => {
  const method = methodLabel(result.installMethod);
  if (result.homebrewFailure !== undefined) {
    switch (result.homebrewFailure) {
      case "target-formula-unavailable":
        return availability?.state === "lagging"
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
  if (!["ready", "not-required"].includes(availability.state)) {
    return (
      availability.details[0] ?? "Installer availability could not be established; no changes made"
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
  readonly outcome: UpgradeAssessmentResult["outcome"];
  readonly change: "updated" | "unchanged" | "unknown";
}

const planMapping = (result: UpgradeSettlement["result"]): PlanMapping => {
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

/**
 * The one plan step an upgrade reports: what changed on the executable the
 * owning installer maintains.
 */
const upgradePlanSteps = (
  result: UpgradeSettlement["result"],
  availability: InstallerAvailability,
): ReadonlyArray<UpgradePlanStep> => {
  const mapping = planMapping(result);
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
  return [
    {
      label: "AXM CLI",
      status: mapping.step,
      message: resultMessage(result, availability),
      details: result.details,
      ...(artifact === undefined ? {} : { artifact }),
    },
  ];
};

const resultDisposition = (
  result: UpgradeSettlement["result"],
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

const assessmentOutcome = (
  result: UpgradeSettlement["result"],
): UpgradeAssessmentResult["outcome"] => {
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

export const toUpgradeAssessment = (input: UpgradeSettlement): UpgradeAssessmentResult => {
  const availability = input.availability;
  return {
    contract: "axm.upgrade-assessment/v1",
    outcome: assessmentOutcome(input.result),
    disposition: resultDisposition(input.result, availability),
    message: resultMessage(input.result, availability),
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
      recommendedCommand:
        input.result.recommendedCommand === null
          ? null
          : {
              ...input.result.recommendedCommand,
              display: formatRecommendedCommand(input.result.recommendedCommand),
            },
    },
    commands: input.result.executedCommands,
    details: {
      messages: Array.from(new Set([...input.result.details, ...availability.details])),
      homebrewFailure: input.result.homebrewFailure ?? null,
      observedFormulaVersion: input.result.observedFormulaVersion ?? null,
    },
    steps: upgradePlanSteps(input.result, availability),
  };
};

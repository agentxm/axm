import * as Schema from "effect/Schema";
import type { PlatformBinaryInfo } from "../domain/index.js";
import { CommandRecordSchema } from "./evidence.js";
import type { VersionResolutionResult } from "./releases.js";

export const ResultStatusSchema = Schema.Literals([
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

export const InstallMethodSchema = Schema.Literals([
  "script",
  "homebrew",
  "npm",
  "pnpm",
  "yarn",
  "unknown",
] as const);
export type ResultInstallMethod = typeof InstallMethodSchema.Type;

export const RecommendedCommandSchema = Schema.Struct({
  executable: Schema.String,
  args: Schema.Array(Schema.String),
  shellRequired: Schema.Boolean,
});
export type RecommendedCommand = typeof RecommendedCommandSchema.Type;

export const VerificationExecutableSchema = Schema.Struct({
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
export type VerificationExecutable = typeof VerificationExecutableSchema.Type;

export const HomebrewFailureSchema = Schema.Literals([
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
export type HomebrewFailure = typeof HomebrewFailureSchema.Type;

export const UpgradeCoreResultSchema = Schema.Struct({
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

type InstallerAvailabilityState =
  "ready" | "lagging" | "leading" | "unavailable" | "indeterminate" | "not-required";

export interface InstallerAvailability {
  readonly state: InstallerAvailabilityState;
  readonly observedVersion: string | null;
  readonly details: ReadonlyArray<string>;
}

/** Execution facts; delivery adapters select their document and presentation. */
export interface UpgradeSettlement {
  readonly result: Omit<UpgradeCoreResult, "availability">;
  readonly resolution: VersionResolutionResult;
  readonly platform: PlatformBinaryInfo;
  readonly requestedVersion: string | undefined;
  readonly availability: InstallerAvailability;
}

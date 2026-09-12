import {
  methodName,
  methodExecutablePath,
  type DetectionSource,
  type InstallMethodType,
  type VersionRelation,
} from "../domain/index.js";
import type { CommandRecord } from "./evidence.js";
import type {
  RecommendedCommand,
  ResultInstallMethod,
  UpgradeCoreResult,
} from "./execution-result.js";

interface DetectionResult {
  readonly installMethod: ResultInstallMethod;
  readonly detectionSource: DetectionSource;
  readonly detectionEvidence: ReadonlyArray<string>;
  readonly detectionConfidence: "high" | "medium" | "low";
  readonly executablePath: string | null;
}

export const detectionResult = (method: InstallMethodType): DetectionResult => ({
  installMethod: methodName(method),
  detectionSource: method.detectionSource ?? "unknown",
  detectionEvidence: method.evidence ?? [],
  detectionConfidence: method.confidence ?? "low",
  executablePath: methodExecutablePath(method),
});

export interface BaseResultInput {
  readonly method: InstallMethodType;
  readonly detectionCommands: ReadonlyArray<CommandRecord>;
  readonly relation: VersionRelation;
  readonly localVersion: string | null;
  readonly targetVersion: string;
  readonly reinstall: boolean;
}

export const upgradeBaseFacts = (input: BaseResultInput) => ({
  ...detectionResult(input.method),
  versionRelation: input.relation,
  localVersion: input.localVersion,
  targetVersion: input.targetVersion,
  reinstall: input.reinstall,
});

export const noMutationResult = (
  input: BaseResultInput,
  resultStatus:
    "already-up-to-date" | "local-newer" | "downgrade-refused" | "manual-action-required",
  recommendation: RecommendedCommand | null,
  details: ReadonlyArray<string> = [],
): UpgradeCoreResult => ({
  ...upgradeBaseFacts(input),
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

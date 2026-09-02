import { formatAxmSkillCompatibilityTarget } from "@agentxm/extension-workspace";

import type { VerbosityLevel } from "../../cli-flags/index.js";
import type { Doc } from "../../screen/index.js";
import { headlineDoc, successDoc } from "../../screen/index.js";
import type { UpgradeCoreResult } from "./handler.js";

export interface UpgradeViewEntry {
  readonly channel: "result" | "note";
  readonly doc: Doc;
}

const note = (doc: Doc): UpgradeViewEntry => ({ channel: "note", doc });
const result = (doc: Doc): UpgradeViewEntry => ({ channel: "result", doc });

const outcomeEntry = (upgrade: UpgradeCoreResult, message: string): UpgradeViewEntry => {
  switch (upgrade.resultStatus) {
    case "upgraded":
    case "reinstalled":
    case "already-up-to-date":
      return result(successDoc(message));
    case "local-newer":
      return note(headlineDoc("info", message));
    case "downgrade-refused":
    case "upgrade-incomplete":
    case "upgrade-unverified":
    case "manual-action-required":
    case "rolled-back":
      return note(headlineDoc("warn", message));
  }
};

const verboseEntries = (upgrade: UpgradeCoreResult): ReadonlyArray<UpgradeViewEntry> => [
  note(
    headlineDoc("info", `Detection: ${upgrade.detectionSource} (${upgrade.detectionConfidence})`),
  ),
  ...upgrade.detectionEvidence.map((evidence) =>
    note(headlineDoc("info", `Evidence: ${evidence}`)),
  ),
  ...upgrade.executedCommands.flatMap((command) => [
    note(
      headlineDoc(
        "info",
        `${command.purpose}: ${command.display} · ${command.executionState} · exit ${command.exitCode === null ? "unavailable" : String(command.exitCode)}${command.outputTruncated ? " · output truncated" : ""}`,
      ),
    ),
    ...(command.stdout.length === 0
      ? []
      : [note(headlineDoc("info", `stdout: ${command.stdout}`))]),
    ...(command.stderr.length === 0
      ? []
      : [note(headlineDoc("info", `stderr: ${command.stderr}`))]),
  ]),
  ...upgrade.verificationExecutables.map((verification) =>
    note(
      headlineDoc(
        "info",
        `Verification (${verification.role}${verification.phase === undefined ? "" : `, ${verification.phase}`}): ${verification.resolvedExecutable ?? verification.path} → ${verification.reportedVersion ?? verification.queryOutcome ?? "unavailable"}`,
      ),
    ),
  ),
  ...(upgrade.backupPath === null
    ? []
    : [note(headlineDoc("info", `Recoverable backup: ${upgrade.backupPath}`))]),
  ...(upgrade.observedFormulaVersion === undefined
    ? []
    : [
        note(
          headlineDoc(
            "info",
            `Homebrew formula: ${upgrade.observedFormulaVersion ?? "unavailable"}`,
          ),
        ),
      ]),
  ...(upgrade.homebrewFailure === undefined
    ? []
    : [note(headlineDoc("info", `Homebrew terminal reason: ${upgrade.homebrewFailure}`))]),
  ...(upgrade.resultStatus === "upgraded" || upgrade.resultStatus === "reinstalled"
    ? [note(headlineDoc("info", "Install metadata: persisted"))]
    : []),
];

export const upgradeView = (
  upgrade: UpgradeCoreResult,
  message: string,
  verbosity: VerbosityLevel,
): ReadonlyArray<UpgradeViewEntry> => {
  if (verbosity === "quiet") {
    const quietMessage =
      upgrade.recommendedCommand === null
        ? message
        : `${message} · Next: ${upgrade.recommendedCommand.display}`;
    return [outcomeEntry(upgrade, quietMessage)];
  }

  return [
    outcomeEntry(upgrade, message),
    ...upgrade.details.map((detail) => note(headlineDoc("info", detail))),
    ...(upgrade.targetVersion === null
      ? []
      : [
          note(
            headlineDoc(
              "info",
              `Compatibility target: ${formatAxmSkillCompatibilityTarget({
                targetCliVersion: upgrade.targetVersion,
                targetSkillVersion: upgrade.targetVersion,
              })}`,
            ),
          ),
        ]),
    ...(upgrade.recommendedCommand === null
      ? []
      : [note(headlineDoc("info", `Next: ${upgrade.recommendedCommand.display}`))]),
    ...(verbosity === "verbose" || verbosity === "debug" ? verboseEntries(upgrade) : []),
  ];
};

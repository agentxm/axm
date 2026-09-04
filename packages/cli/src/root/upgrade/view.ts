import { formatAxmSkillCompatibilityTarget } from "@agentxm/extension-workspace";

import type { VerbosityLevel } from "../../cli-flags/index.js";
import type { Doc } from "../../screen/index.js";
import { headlineDoc, successDoc } from "../../screen/index.js";
import { methodLabel, type UpgradeCoreResult } from "./handler.js";

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
    case "preview":
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

const TERMINAL_FAILURES: ReadonlySet<UpgradeCoreResult["resultStatus"]> = new Set([
  "upgrade-incomplete",
  "upgrade-unverified",
  "rolled-back",
]);

const MAX_TAIL_LINES = 10;
const MAX_TAIL_CHARACTERS = 600;

/** The last lines of an external command's output, bounded for a terminal. */
const outputTail = (output: string): string | null => {
  const lines = output.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return null;
  const tail = lines.slice(-MAX_TAIL_LINES).join("\n");
  return tail.length > MAX_TAIL_CHARACTERS ? `…${tail.slice(-MAX_TAIL_CHARACTERS)}` : tail;
};

/**
 * The output of the command whose failure produced this result. A terminal
 * failure already tells the reader to inspect this output, so it is shown
 * where the instruction is — not behind a flag that would make acting on the
 * message require rerunning a mutating command.
 */
const failureEvidence = (upgrade: UpgradeCoreResult): ReadonlyArray<UpgradeViewEntry> => {
  if (!TERMINAL_FAILURES.has(upgrade.resultStatus)) return [];
  const failing = [...upgrade.executedCommands]
    .reverse()
    .find((command) => command.executionState !== "exited" || command.exitCode !== 0);
  if (failing === undefined) return [];
  const tail = outputTail(failing.stderr) ?? outputTail(failing.stdout);
  if (tail === null) return [];
  return [
    note(headlineDoc("warn", `Output from ${failing.display}:`)),
    ...tail.split("\n").map((line) => note(headlineDoc("info", line))),
  ];
};

/**
 * Resolved facts the reader cannot obtain any other way and that change what
 * happened: which installer owns the installation, the exact command it was
 * handed, and the executable that was checked afterwards. These belong at
 * default verbosity; `--verbose` keeps the full command-by-command audit
 * trail below.
 */
const resolvedFacts = (upgrade: UpgradeCoreResult): ReadonlyArray<UpgradeViewEntry> => [
  note(headlineDoc("info", `Install method: ${methodLabel(upgrade.installMethod)}`)),
  ...upgrade.executedCommands
    .filter((command) => command.purpose === "delegation")
    .map((command) => note(headlineDoc("info", `Ran: ${command.display}`))),
  ...upgrade.verificationExecutables
    .filter((verification) => verification.reportedVersion !== null)
    .slice(-1)
    .map((verification) =>
      note(
        headlineDoc(
          "info",
          `Verified: ${verification.resolvedExecutable ?? verification.path} reported ${verification.reportedVersion ?? ""}`,
        ),
      ),
    ),
];

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
    ...resolvedFacts(upgrade),
    ...upgrade.details.map((detail) => note(headlineDoc("info", detail))),
    ...failureEvidence(upgrade),
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

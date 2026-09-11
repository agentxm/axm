/**
 * The human view of an upgrade assessment. Every fact it shows is read from
 * the typed `axm.upgrade-assessment/v1` result; the wording is the CLI's.
 */

import type { VerbosityLevel } from "../../cli-flags/index.js";
import type { Doc } from "../../screen/index.js";
import { headlineDoc, successDoc } from "../../screen/index.js";
import { methodLabel, type UpgradeAssessmentResult } from "@agentxm/cli-update";
import { formatAxmSkillCompatibilityTarget } from "@agentxm/extension-resolution";

export interface UpgradeViewEntry {
  readonly channel: "result" | "note";
  readonly doc: Doc;
}

type Disposition = UpgradeAssessmentResult["disposition"];

const note = (doc: Doc): UpgradeViewEntry => ({ channel: "note", doc });
const result = (doc: Doc): UpgradeViewEntry => ({ channel: "result", doc });

const outcomeEntry = (upgrade: UpgradeAssessmentResult, message: string): UpgradeViewEntry => {
  switch (upgrade.disposition) {
    case "upgraded":
    case "reinstalled":
    case "already-current":
      return result(successDoc(message));
    case "previewed":
    case "local-newer":
      return note(headlineDoc("info", message));
    case "downgrade-refused":
    case "installer-lagging":
    case "installer-leading":
    case "installer-unavailable":
    case "installer-indeterminate":
    case "mutation-failed":
    case "verification-failed":
    case "recovery-required":
    case "rolled-back":
      return note(headlineDoc("warn", message));
  }
};

const TERMINAL_FAILURES: ReadonlySet<Disposition> = new Set<Disposition>([
  "mutation-failed",
  "verification-failed",
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
const failureEvidence = (upgrade: UpgradeAssessmentResult): ReadonlyArray<UpgradeViewEntry> => {
  if (!TERMINAL_FAILURES.has(upgrade.disposition)) return [];
  const failing = [...upgrade.commands]
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
const resolvedFacts = (upgrade: UpgradeAssessmentResult): ReadonlyArray<UpgradeViewEntry> => [
  note(headlineDoc("info", `Install method: ${methodLabel(upgrade.ownership.method)}`)),
  ...upgrade.commands
    .filter((command) => command.purpose === "delegation")
    .map((command) => note(headlineDoc("info", `Ran: ${command.display}`))),
  ...upgrade.verification.executables
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

const verboseEntries = (upgrade: UpgradeAssessmentResult): ReadonlyArray<UpgradeViewEntry> => [
  note(
    headlineDoc("info", `Detection: ${upgrade.ownership.source} (${upgrade.ownership.confidence})`),
  ),
  ...upgrade.ownership.evidence.map((evidence) =>
    note(headlineDoc("info", `Evidence: ${evidence}`)),
  ),
  ...upgrade.commands.flatMap((command) => [
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
  ...upgrade.verification.executables.map((verification) =>
    note(
      headlineDoc(
        "info",
        `Verification (${verification.role}${verification.phase === undefined ? "" : `, ${verification.phase}`}): ${verification.resolvedExecutable ?? verification.path} → ${verification.reportedVersion ?? verification.queryOutcome ?? "unavailable"}`,
      ),
    ),
  ),
  ...(upgrade.recovery.backupPath === null
    ? []
    : [note(headlineDoc("info", `Recoverable backup: ${upgrade.recovery.backupPath}`))]),
  ...(upgrade.details.observedFormulaVersion === null
    ? []
    : [note(headlineDoc("info", `Homebrew formula: ${upgrade.details.observedFormulaVersion}`))]),
  ...(upgrade.details.homebrewFailure === null
    ? []
    : [note(headlineDoc("info", `Homebrew terminal reason: ${upgrade.details.homebrewFailure}`))]),
  ...(upgrade.disposition === "upgraded" || upgrade.disposition === "reinstalled"
    ? [note(headlineDoc("info", "Install metadata: persisted"))]
    : []),
];

export const upgradeView = (
  upgrade: UpgradeAssessmentResult,
  verbosity: VerbosityLevel,
): ReadonlyArray<UpgradeViewEntry> => {
  const recommended = upgrade.recovery.recommendedCommand;
  if (verbosity === "quiet") {
    const quietMessage =
      recommended === null ? upgrade.message : `${upgrade.message} · Next: ${recommended.display}`;
    return [outcomeEntry(upgrade, quietMessage)];
  }

  return [
    outcomeEntry(upgrade, upgrade.message),
    ...resolvedFacts(upgrade),
    ...upgrade.details.messages.map((detail) => note(headlineDoc("info", detail))),
    ...failureEvidence(upgrade),
    ...[
      note(
        headlineDoc(
          "info",
          `Compatibility target: ${formatAxmSkillCompatibilityTarget({
            targetCliVersion: upgrade.target.version,
            targetSkillVersion: upgrade.target.version,
          })}`,
        ),
      ),
    ],
    ...(recommended === null ? [] : [note(headlineDoc("info", `Next: ${recommended.display}`))]),
    ...(verbosity === "verbose" || verbosity === "debug" ? verboseEntries(upgrade) : []),
  ];
};

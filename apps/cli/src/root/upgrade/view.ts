/**
 * The human view of an upgrade assessment. Every fact it shows is read from
 * the typed `axm.upgrade-assessment/v1` result; the wording is the CLI's.
 */

import type { VerbosityLevel } from "../../cli-flags/index.js";
import type { Doc } from "../../screen/index.js";
import { headlineDoc, successDoc } from "../../screen/index.js";
import {
  methodLabel,
  type UpgradeAssessmentResult,
} from "@agentxm/cli-maintenance/self-update/adapters/cli";
import { formatAxmSkillCompatibilityTarget } from "@agentxm/cli-maintenance/official-skill/adapters/cli";

type Disposition = UpgradeAssessmentResult["disposition"];

const outcomeEntry = (upgrade: UpgradeAssessmentResult, message: string): Doc => {
  switch (upgrade.disposition) {
    case "upgraded":
    case "reinstalled":
    case "already-current":
      return successDoc(message);
    case "previewed":
    case "local-newer":
      return headlineDoc("info", message);
    case "downgrade-refused":
    case "installer-lagging":
    case "installer-leading":
    case "installer-unavailable":
    case "installer-indeterminate":
    case "mutation-failed":
    case "verification-failed":
    case "recovery-required":
    case "rolled-back":
      return headlineDoc("warn", message);
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
  return tail.length > MAX_TAIL_CHARACTERS ? `...${tail.slice(-MAX_TAIL_CHARACTERS)}` : tail;
};

/**
 * The output of the command whose failure produced this result. A terminal
 * failure already tells the reader to inspect this output, so it is shown
 * where the instruction is — not behind a flag that would make acting on the
 * message require rerunning a mutating command.
 */
const failureEvidence = (upgrade: UpgradeAssessmentResult): Doc => {
  if (!TERMINAL_FAILURES.has(upgrade.disposition)) return [];
  const failing = [...upgrade.commands]
    .reverse()
    .find((command) => command.executionState !== "exited" || command.exitCode !== 0);
  if (failing === undefined) return [];
  const tail = outputTail(failing.stderr) ?? outputTail(failing.stdout);
  if (tail === null) return [];
  return [
    ...headlineDoc("warn", `Output from ${failing.display}:`),
    ...tail.split("\n").flatMap((line) => headlineDoc("info", line)),
  ];
};

/**
 * Resolved facts the reader cannot obtain any other way and that change what
 * happened: which installer owns the installation, the exact command it was
 * handed, and the executable that was checked afterwards. These belong at
 * default verbosity; `--verbose` keeps the full command-by-command audit
 * trail below.
 */
const resolvedFacts = (upgrade: UpgradeAssessmentResult): Doc => [
  ...headlineDoc("info", `Install method: ${methodLabel(upgrade.ownership.method)}`),
  ...upgrade.commands
    .filter((command) => command.purpose === "delegation")
    .flatMap((command) => headlineDoc("info", `Ran: ${command.display}`)),
  ...upgrade.verification.executables
    .filter((verification) => verification.reportedVersion !== null)
    .slice(-1)
    .flatMap((verification) =>
      headlineDoc(
        "info",
        `Verified: ${verification.resolvedExecutable ?? verification.path} reported ${verification.reportedVersion ?? ""}`,
      ),
    ),
];

const verboseEntries = (upgrade: UpgradeAssessmentResult): Doc => [
  ...headlineDoc(
    "info",
    `Detection: ${upgrade.ownership.source} (${upgrade.ownership.confidence})`,
  ),
  ...upgrade.ownership.evidence.flatMap((evidence) => headlineDoc("info", `Evidence: ${evidence}`)),
  ...upgrade.commands.flatMap((command) => [
    ...headlineDoc(
      "info",
      `${command.purpose}: ${command.display}, ${command.executionState}, exit ${command.exitCode === null ? "unavailable" : String(command.exitCode)}${command.outputTruncated ? ", output truncated" : ""}`,
    ),
    ...(command.stdout.length === 0 ? [] : headlineDoc("info", `stdout: ${command.stdout}`)),
    ...(command.stderr.length === 0 ? [] : headlineDoc("info", `stderr: ${command.stderr}`)),
  ]),
  ...upgrade.verification.executables.flatMap((verification) =>
    headlineDoc(
      "info",
      `Verification (${verification.role}${verification.phase === undefined ? "" : `, ${verification.phase}`}): ${verification.resolvedExecutable ?? verification.path} -> ${verification.reportedVersion ?? verification.queryOutcome ?? "unavailable"}`,
    ),
  ),
  ...(upgrade.recovery.backupPath === null
    ? []
    : headlineDoc("info", `Recoverable backup: ${upgrade.recovery.backupPath}`)),
  ...(upgrade.details.observedFormulaVersion === null
    ? []
    : headlineDoc("info", `Homebrew formula: ${upgrade.details.observedFormulaVersion}`)),
  ...(upgrade.details.homebrewFailure === null
    ? []
    : headlineDoc("info", `Homebrew terminal reason: ${upgrade.details.homebrewFailure}`)),
  ...(upgrade.disposition === "upgraded" || upgrade.disposition === "reinstalled"
    ? headlineDoc("info", "Install metadata: persisted")
    : []),
];

export const upgradeView = (upgrade: UpgradeAssessmentResult, verbosity: VerbosityLevel): Doc => {
  const recommended = upgrade.recovery.recommendedCommand;
  if (verbosity === "quiet") {
    return [
      ...outcomeEntry(upgrade, upgrade.message),
      ...failureEvidence(upgrade),
      ...(recommended === null ? [] : headlineDoc("info", `Next: ${recommended.display}`)),
    ];
  }
  return [
    ...outcomeEntry(upgrade, upgrade.message),
    ...resolvedFacts(upgrade),
    ...upgrade.details.messages.flatMap((detail) => headlineDoc("info", detail)),
    ...failureEvidence(upgrade),
    ...headlineDoc(
      "info",
      `Compatibility target: ${formatAxmSkillCompatibilityTarget({
        targetCliVersion: upgrade.target.version,
        targetSkillVersion: upgrade.target.version,
      })}`,
    ),
    ...(recommended === null ? [] : headlineDoc("info", `Next: ${recommended.display}`)),
    ...(verbosity === "verbose" || verbosity === "debug" ? verboseEntries(upgrade) : []),
  ];
};

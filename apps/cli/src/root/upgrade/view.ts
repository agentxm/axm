/**
 * The human view of an upgrade assessment. Every fact it shows is read from
 * the typed `upgrade-assessment-v1` result; the wording is the CLI's.
 */

import type { FailureSuggestedAction } from "@agentxm/workspace-kernel/operations";

import type { VerbosityLevel } from "../../cli-flags/index.js";
import {
  capitalized,
  conditionDoc,
  invocation,
  recordDoc,
  type CalloutNode,
  type Doc,
  type Field,
  type Tone,
} from "../../screen/index.js";
import {
  methodLabel,
  type UpgradeAssessmentResult,
} from "@agentxm/cli-maintenance/self-update/adapters/cli";
import { formatAxmSkillCompatibilityTarget } from "@agentxm/cli-maintenance/official-skill/domain";

type Disposition = UpgradeAssessmentResult["disposition"];

const outcomeTone = (upgrade: UpgradeAssessmentResult): Tone => {
  switch (upgrade.disposition) {
    case "upgraded":
    case "reinstalled":
    case "already-current":
      return "ok";
    case "previewed":
    case "local-newer":
      return "info";
    case "downgrade-refused":
    case "installer-lagging":
    case "installer-leading":
    case "installer-unavailable":
    case "installer-indeterminate":
    case "mutation-failed":
    case "verification-failed":
    case "recovery-required":
    case "rolled-back":
      return "warn";
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
 * message require rerunning a mutating command. It is the command's own
 * output, so it passes through untouched.
 */
const failureEvidence = (upgrade: UpgradeAssessmentResult): ReadonlyArray<CalloutNode> => {
  if (!TERMINAL_FAILURES.has(upgrade.disposition)) return [];
  const failing = [...upgrade.commands]
    .reverse()
    .find((command) => command.executionState !== "exited" || command.exitCode !== 0);
  if (failing === undefined) return [];
  const tail = outputTail(failing.stderr) ?? outputTail(failing.stdout);
  if (tail === null) return [];
  return [
    conditionDoc({
      tone: "warn",
      title: [{ text: "Output from " }, ...invocation(failing.display)],
      children: [{ _tag: "raw", content: tail }],
    }),
  ];
};

/**
 * Resolved facts the reader cannot obtain any other way and that change what
 * happened: which installer owns the installation, the exact command it was
 * handed, the executable that was checked afterwards, and the skill version
 * this CLI expects. These belong at default verbosity; `--verbose` adds the
 * full command-by-command audit trail.
 */
const resolvedFields = (upgrade: UpgradeAssessmentResult): ReadonlyArray<Field> => [
  { label: "Install method", value: methodLabel(upgrade.ownership.method) },
  ...upgrade.commands
    .filter((command) => command.purpose === "delegation")
    .map((command) => ({ label: "Ran", value: invocation(command.display) })),
  ...upgrade.verification.executables
    .filter((verification) => verification.reportedVersion !== null)
    .slice(-1)
    .map((verification) => ({
      label: "Verified",
      value: `${verification.resolvedExecutable ?? verification.path} reported ${verification.reportedVersion ?? ""}`,
    })),
  {
    label: "Compatibility target",
    value: formatAxmSkillCompatibilityTarget({
      targetCliVersion: upgrade.target.version,
      targetSkillVersion: upgrade.target.version,
    }),
  },
];

/** The audit trail a reader asked for: how ownership was decided and what every command did. */
const auditSection = (upgrade: UpgradeAssessmentResult): Doc => [
  {
    _tag: "fields",
    fields: [
      {
        label: "Detection",
        value: `${upgrade.ownership.source} (${upgrade.ownership.confidence})`,
      },
      ...upgrade.ownership.evidence.map((evidence) => ({ label: "Evidence", value: evidence })),
      ...upgrade.commands.map((command) => ({
        label: `${capitalized(command.purpose)} command`,
        value: `${command.display}, ${command.executionState}, exit ${command.exitCode === null ? "unavailable" : String(command.exitCode)}${command.outputTruncated ? ", output truncated" : ""}`,
      })),
      ...upgrade.verification.executables.map((verification) => ({
        label: `Verification (${verification.role}${verification.phase === undefined ? "" : `, ${verification.phase}`})`,
        value: `${verification.resolvedExecutable ?? verification.path} reported ${verification.reportedVersion ?? verification.queryOutcome ?? "unavailable"}`,
      })),
      ...(upgrade.recovery.backupPath === null
        ? []
        : [{ label: "Recoverable backup", value: upgrade.recovery.backupPath }]),
      ...(upgrade.details.observedFormulaVersion === null
        ? []
        : [{ label: "Homebrew formula", value: upgrade.details.observedFormulaVersion }]),
      ...(upgrade.details.homebrewFailure === null
        ? []
        : [{ label: "Homebrew terminal reason", value: upgrade.details.homebrewFailure }]),
      ...(upgrade.disposition === "upgraded" || upgrade.disposition === "reinstalled"
        ? [{ label: "Install metadata", value: "persisted" }]
        : []),
    ],
  },
  ...upgrade.commands.flatMap((command): Doc => [
    ...(command.stdout.length === 0 ? [] : [{ _tag: "raw", content: command.stdout } as const]),
    ...(command.stderr.length === 0 ? [] : [{ _tag: "raw", content: command.stderr } as const]),
  ]),
];

/**
 * An upgrade as a record: what happened, the facts that decided it, the
 * output of a command that failed, the audit trail at verbose level, and the
 * next safe action.
 */
export const upgradeView = (
  upgrade: UpgradeAssessmentResult,
  verbosity: VerbosityLevel,
  next: ReadonlyArray<FailureSuggestedAction>,
): Doc => {
  const quiet = verbosity === "quiet";
  const detailed = verbosity === "verbose" || verbosity === "debug";
  return recordDoc({
    tone: outcomeTone(upgrade),
    verdict: upgrade.message,
    ...(quiet ? {} : { fields: resolvedFields(upgrade), notes: upgrade.details.messages }),
    conditions: failureEvidence(upgrade),
    ...(detailed ? { sections: [{ title: "Details", children: auditSection(upgrade) }] } : {}),
    next,
  });
};

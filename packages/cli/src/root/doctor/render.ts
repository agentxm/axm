import type { VerbosityLevel } from "@axm.sh/core/unstable/cli-flags";
import type {
  Action,
  Check,
  CheckStatus,
  Finding,
  FindingSeverity,
  ReportSummary,
  WorkspaceDoctorReport,
} from "@axm.sh/core/unstable/workspace";

const ACTION_COMMAND_COLUMN_WIDTH = 20;

const isVerboseRender = (verbosity: VerbosityLevel): boolean =>
  verbosity === "verbose" || verbosity === "debug";

export const symbolForStatus = (status: CheckStatus): string => {
  switch (status) {
    case "pass":
      return "✓";
    case "warn":
      return "⚠";
    case "fail":
      return "✗";
    case "skip":
      return "⊘";
  }
};

export const symbolForSeverity = (severity: FindingSeverity): string => {
  switch (severity) {
    case "error":
      return "✗";
    case "warn":
      return "⚠";
    case "info":
      return "ℹ";
  }
};

const plural = (n: number, singular: string, pluralForm: string): string =>
  n === 1 ? `${String(n)} ${singular}` : `${String(n)} ${pluralForm}`;

const padRight = (value: string, width: number): string => {
  if (value.length >= width) {
    return value;
  }
  return value + " ".repeat(width - value.length);
};

export const computeCheckHeaderAction = (check: Check): Action | undefined => {
  const nonInfo = check.findings.filter((finding) => finding.severity !== "info");
  if (nonInfo.length === 0) {
    return undefined;
  }
  const first = nonInfo[0];
  if (first === undefined) {
    return undefined;
  }
  const firstCommand = first.action?.command;
  if (firstCommand === undefined) {
    return undefined;
  }
  for (const finding of nonInfo) {
    if (finding.action?.command !== firstCommand) {
      return undefined;
    }
  }
  return first.action;
};

export const formatSummaryLine = (summary: ReportSummary): string => {
  const parts = [
    plural(summary.checks.passed, "passed", "passed"),
    plural(summary.checks.failed, "failed", "failed"),
    plural(summary.checks.skipped, "skipped", "skipped"),
    plural(summary.checks.info, "advisory", "advisories"),
  ];
  return parts.join(" · ");
};

const countsBadge = (check: Check): string => {
  let errors = 0;
  let warnings = 0;
  for (const finding of check.findings) {
    if (finding.severity === "error") {
      errors += 1;
    } else if (finding.severity === "warn") {
      warnings += 1;
    }
  }
  const parts: Array<string> = [];
  if (errors > 0) {
    parts.push(plural(errors, "error", "errors"));
  }
  if (warnings > 0) {
    parts.push(plural(warnings, "warning", "warnings"));
  }
  return parts.join(", ");
};

const formatActionCommandDisplay = (action: Action): string => {
  const command = action.command ?? "";
  return command.length > 0 ? command : action.label;
};

const formatActionLine = (action: Action): string => {
  const commandDisplay = `→ ${formatActionCommandDisplay(action)}`;
  return `    ${padRight(commandDisplay, ACTION_COMMAND_COLUMN_WIDTH)}  ${action.description}`;
};

const appendFindingLines = (
  lines: Array<string>,
  finding: Finding,
  headerActionCommand: string | undefined,
): void => {
  lines.push(`  ${symbolForSeverity(finding.severity)} ${finding.message}`);
  if (finding.details !== undefined && finding.details.length > 0) {
    for (const detail of finding.details.split("\n")) {
      lines.push(`      ${detail}`);
    }
  }
  const action = finding.action;
  if (action === undefined) {
    return;
  }
  if (
    headerActionCommand !== undefined &&
    action.command !== undefined &&
    action.command === headerActionCommand
  ) {
    return;
  }
  lines.push(
    `      → ${padRight(formatActionCommandDisplay(action), ACTION_COMMAND_COLUMN_WIDTH)}  ${action.description}`,
  );
};

const appendCheckHeader = (
  lines: Array<string>,
  check: Check,
  verbosity: VerbosityLevel,
  headerAction: Action | undefined,
): void => {
  const symbol = symbolForStatus(check.status);
  if (check.status === "skip") {
    lines.push(`${symbol} ${check.title}   (skipped)`);
    if (check.skipReason !== undefined && check.skipReason.length > 0) {
      lines.push(`    ${check.skipReason}`);
    }
    return;
  }

  if (check.status === "pass") {
    const infoFindings = check.findings.filter((finding) => finding.severity === "info");
    if (infoFindings.length === 0 || !isVerboseRender(verbosity)) {
      lines.push(`${symbol} ${check.title}`);
      return;
    }
    lines.push(
      `${symbol} ${check.title}   ${plural(infoFindings.length, "advisory", "advisories")}`,
    );
    return;
  }

  const badge = countsBadge(check);
  lines.push(badge.length > 0 ? `${symbol} ${check.title}   ${badge}` : `${symbol} ${check.title}`);
  if (headerAction !== undefined) {
    lines.push(formatActionLine(headerAction));
  }
};

const shouldExpandFindings = (check: Check, verbosity: VerbosityLevel): boolean => {
  if (verbosity === "quiet") {
    return false;
  }
  if (check.status === "skip") {
    return false;
  }
  if (check.status === "pass") {
    return isVerboseRender(verbosity) && check.findings.length > 0;
  }
  return true;
};

const shouldRenderCheck = (check: Check, verbosity: VerbosityLevel): boolean => {
  if (verbosity !== "quiet") {
    return true;
  }
  return check.status !== "pass";
};

export const renderHumanReport = (
  report: WorkspaceDoctorReport,
  verbosity: VerbosityLevel,
): ReadonlyArray<string> => {
  const lines: Array<string> = [];

  if (verbosity !== "quiet" || !report.healthy) {
    lines.push(`Workspace Health — ${report.workspacePath}  (${report.scope} scope)`);
    lines.push("");
  }

  for (const check of report.checks) {
    if (!shouldRenderCheck(check, verbosity)) {
      continue;
    }
    const headerAction = computeCheckHeaderAction(check);
    appendCheckHeader(lines, check, verbosity, headerAction);
    if (shouldExpandFindings(check, verbosity)) {
      const headerActionCommand = headerAction?.command;
      for (const finding of check.findings) {
        if (!isVerboseRender(verbosity) && finding.severity === "info") {
          continue;
        }
        appendFindingLines(lines, finding, headerActionCommand);
      }
    }
  }

  if (verbosity !== "quiet" || !report.healthy) {
    lines.push("");
    lines.push(formatSummaryLine(report.summary));
  }

  if (!report.healthy) {
    const hasSyncAction = report.checks.some((check) =>
      check.findings.some((finding) => finding.action?.command === "axm sync"),
    );
    if (hasSyncAction) {
      lines.push("Run `axm sync` to reconcile the workspace.");
    }
  }

  return lines;
};

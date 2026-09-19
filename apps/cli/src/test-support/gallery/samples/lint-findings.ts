import type { LintHumanFinding } from "../../../root/lint/human-findings.js";

import { lintDoc, type LintViewInput } from "../../../root/lint/view.js";
import type { Doc } from "../../../screen/doc.js";

type Severity = LintHumanFinding["severity"];

const finding = (
  severity: Severity,
  ruleId: string,
  title: string,
  path: string,
  extra?: Partial<Pick<LintHumanFinding, "details" | "helps" | "fixable" | "ruleDescription">>,
): LintHumanFinding => ({
  severity,
  ruleId,
  ruleDescription: extra?.ruleDescription ?? `${title}.`,
  title: `${title}.`,
  details: extra?.details ?? [],
  helps: extra?.helps ?? [],
  fixable: extra?.fixable ?? false,
  path,
});

/** The canvas's three findings: two errors, one of them fixable, and a warning. */
export const staleLockfile = finding(
  "error",
  "workspace/lockfile-valid",
  "Lockfile is stale",
  "axm-lock.yaml",
  { details: ["2 entries do not match axm.json."], fixable: true },
);

export const missingDescription = finding(
  "error",
  "skill/description-present",
  "Description is missing",
  "skills/triage/SKILL.md",
  { helps: ["Agents choose skills by description."] },
);

export const floatingMember = finding(
  "warning",
  "pack/member-pinned",
  "Member version floats",
  "packs/review-kit",
  { helps: ["Pin @acme/skills/triage for repeatable installs."] },
);

/** `count` findings of one rule at distinct locations, named from `paths` then numbered. */
export const repeated = (
  base: LintHumanFinding,
  paths: ReadonlyArray<string>,
  count: number,
): ReadonlyArray<LintHumanFinding> =>
  Array.from({ length: count }, (_, index) => ({
    ...base,
    path: paths[index] ?? `${base.path}-${String(index + 1)}`,
  }));

const counted = (findings: ReadonlyArray<LintHumanFinding>): LintViewInput["counts"] => ({
  total: findings.length,
  errors: findings.filter((entry) => entry.severity === "error").length,
  warnings: findings.filter((entry) => entry.severity === "warning").length,
  infos: findings.filter((entry) => entry.severity === "info").length,
});

/** What `axm lint` prints for these findings in this project, with exit 1 when any is an error. */
export const lintFrame = (
  findings: ReadonlyArray<LintHumanFinding>,
  options?: Partial<Pick<LintViewInput, "repaired" | "fix" | "driftBanner" | "verbosity">>,
): Doc =>
  lintDoc({
    findings,
    repaired: options?.repaired ?? [],
    counts: counted(findings),
    driftBanner: options?.driftBanner ?? [],
    fix: options?.fix ?? false,
    scope: "project",
    exitCode: findings.some((entry) => entry.severity === "error") ? 1 : 0,
    verbosity: options?.verbosity ?? "normal",
  });

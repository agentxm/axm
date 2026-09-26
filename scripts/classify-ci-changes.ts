import { execFileSync } from "node:child_process";
import { appendFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { parseReleaseCommitSubject, SEMVER_VERSION_REGEX } from "./release-identity.js";

export type CiCheck =
  | "cli-e2e"
  | "documentation"
  | "extension-lint"
  | "release-artifacts"
  | "secrets"
  | "source"
  | "specification-verdict"
  | "windows"
  | "workflow-security";

export interface CiCheckSelection {
  readonly reason: string;
  readonly selected: boolean;
}

export interface CiChangeClassification {
  readonly categories: readonly string[];
  readonly checks: Readonly<Record<CiCheck, CiCheckSelection>>;
  readonly code: boolean;
  readonly documentation: boolean;
  readonly full: boolean;
  readonly releaseInfrastructure: boolean;
  readonly workflow: boolean;
}

export interface CiSelectionResult extends CiChangeClassification {
  readonly base: string;
  readonly head: string;
  readonly releasePreparation: boolean;
  readonly version: 1;
}

const isDocumentationPath = (path: string) =>
  path.startsWith("contributing/") || /(?:^|\/)\w[^/]*\.mdx?$/u.test(path);
const isAgentInstructionPath = (path: string) => /(?:^|\/)(?:AGENTS|CLAUDE)\.md$/u.test(path);

// Markdown owned by executable projects or generators is runtime/tooling
// content, not human documentation.
const workspaceSourcePrefixes: readonly string[] = [
  ".agents/",
  ".claude/",
  ".husky/",
  ".nx/",
  ".vscode/",
  "agent_extensions/",
  "apps/",
  "benchmarks/",
  "packages/",
  "tools/",
  "skills/",
  "specifications/",
];
const workspaceSourceFiles: readonly string[] = ["README.md"];
const isWorkspaceSourcePath = (path: string) =>
  workspaceSourcePrefixes.some((prefix) => path.startsWith(prefix)) ||
  workspaceSourceFiles.includes(path);
const isDocumentationOnlyPath = (path: string) =>
  isDocumentationPath(path) && !isAgentInstructionPath(path) && !isWorkspaceSourcePath(path);
const isWorkflowPath = (path: string) => path.startsWith(".github/");
const isReleaseInfrastructurePath = (path: string) =>
  path.startsWith("infra/") ||
  path.startsWith("scripts/release-") ||
  path === ".github/workflows/prepare-release.yml" ||
  path === ".github/workflows/publish.yml" ||
  ["mise.toml", "nx.json", "package.json", "pnpm-lock.yaml", "project.json"].includes(path);
const isCiExecutionPath = (path: string) =>
  path === ".github/workflows/ci.yml" ||
  path.startsWith(".github/actions/setup-workspace/") ||
  path === "scripts/classify-ci-changes.ts" ||
  path === "scripts/classify-ci-changes.test.ts" ||
  path === "scripts/release-identity.ts";
const isCliRuntimePath = (path: string) =>
  path.startsWith("apps/cli/") ||
  path.startsWith("apps/cli-e2e/") ||
  path.startsWith("packages/") ||
  path.startsWith("skills/");
const knownRootFiles = [
  ".gitleaks.toml",
  ".gitleaksignore",
  ".npmrc",
  ".nvmrc",
  ".pnpmfile.cjs",
  ".prettierignore",
  ".prettierrc",
  "AGENTS.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "allurerc.ts",
  "eslint.config.mjs",
  "mise.toml",
  "nx.json",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "project.json",
  "tsconfig.base.json",
  "tsconfig.json",
  "vitest.config.ts",
  "vitest.execution.ts",
  "vitest.reporting.ts",
  "vitest.purpose.setup.ts",
];
const isKnownPath = (path: string) =>
  isDocumentationOnlyPath(path) ||
  isAgentInstructionPath(path) ||
  isWorkflowPath(path) ||
  isWorkspaceSourcePath(path) ||
  path.startsWith("infra/") ||
  path.startsWith("scripts/") ||
  knownRootFiles.includes(path);
const check = (selected: boolean, selectedReason: string, excludedReason: string) => ({
  selected,
  reason: selected ? selectedReason : excludedReason,
});

export const selectCodeVerificationPaths = (paths: readonly string[]) =>
  paths.filter((path) => !isDocumentationOnlyPath(path) && !isWorkflowPath(path));

export const classifyCiChanges = (
  paths: readonly string[],
  context: { readonly releaseArtifacts?: boolean } = {},
): CiChangeClassification => {
  const documentation = paths.some(isDocumentationOnlyPath);
  const workflow = paths.some(isWorkflowPath);
  const releaseInfrastructure = paths.some(isReleaseInfrastructurePath);
  const unknown = paths.some((path) => !isKnownPath(path));
  const ciExecution = paths.some(isCiExecutionPath);
  const codeVerificationPaths = selectCodeVerificationPaths(paths);
  const full = unknown || ciExecution || paths.length === 0;
  const code = codeVerificationPaths.length > 0 || releaseInfrastructure || full;
  const cliRuntime = full || paths.some(isCliRuntimePath);
  const releaseArtifacts = context.releaseArtifacts === true;
  const categories = [
    documentation && "documentation",
    workflow && "workflow",
    code && "source",
    releaseInfrastructure && "release-infrastructure",
    cliRuntime && "cli-runtime",
    unknown && "unknown-input",
  ].filter((category): category is string => typeof category === "string");

  return {
    categories,
    checks: {
      secrets: check(true, "security runs for every change", "unreachable"),
      documentation: check(
        documentation,
        "human documentation changed",
        "no human documentation changed",
      ),
      "workflow-security": check(
        workflow,
        "GitHub Actions configuration changed",
        "workflow configuration is unchanged",
      ),
      source: check(
        code || full,
        full
          ? "uncertain or CI-defining input requires full verification"
          : "executable source or toolchain input changed",
        "human-documentation-only change",
      ),
      "specification-verdict": check(
        code || full,
        "source verification includes the per-change specification verdict",
        "no executable contract changed",
      ),
      "extension-lint": check(
        code || full,
        "source verification includes extension integrity",
        "no executable extension content changed",
      ),
      "cli-e2e": check(
        cliRuntime,
        full
          ? "full fallback or CI execution path changed"
          : "CLI runtime or transitive package input changed",
        "change cannot affect the CLI runtime",
      ),
      windows: check(
        cliRuntime,
        full ? "full fallback or CI execution path changed" : "portable CLI runtime input changed",
        "change cannot affect Windows CLI behavior",
      ),
      "release-artifacts": check(
        releaseArtifacts,
        "canonical main release commit selected the publication artifact stage",
        "ordinary CI does not produce release-grade artifacts",
      ),
    },
    code,
    documentation,
    full,
    releaseInfrastructure,
    workflow,
  };
};

export const selectsReleaseArtifacts = (context: {
  readonly event: string;
  readonly ref: string;
  readonly subject: string;
}): boolean => {
  const release = parseReleaseCommitSubject(context.subject);
  return (
    release !== undefined &&
    ((context.event === "push" && context.ref === "refs/heads/main") ||
      (context.event === "workflow_dispatch" && context.ref === `refs/tags/${release.tag}`))
  );
};

export const detectsReleasePreparation = (context: {
  readonly event: string;
  readonly headRef: string;
  readonly headRepository: string;
  readonly repository: string;
  readonly subjects: readonly string[];
}): boolean => {
  if (context.event === "merge_group") {
    return context.subjects.some((subject) => parseReleaseCommitSubject(subject) !== undefined);
  }
  if (context.event !== "pull_request" || context.headRepository !== context.repository) {
    return false;
  }
  const tag = context.headRef.startsWith("release/")
    ? context.headRef.slice("release/".length)
    : "";
  return (
    tag.startsWith("cli-v") &&
    SEMVER_VERSION_REGEX.test(tag.slice("cli-v".length)) &&
    context.subjects.includes(`release: ${tag}`)
  );
};

export const requiredCiJobs = (
  selection: CiChangeClassification,
  event: string,
): readonly string[] => {
  const required = ["classify", "secrets"];
  if (selection.checks["release-artifacts"].selected) {
    return [
      ...required,
      "verify-main",
      "verify-e2e",
      "windows-workspace",
      "binary-smoke",
      "release-content",
      "npm-cohort",
    ];
  }
  if (event === "schedule" || event === "workflow_dispatch") {
    return [...required, "verify-main", "verify-e2e", "windows-workspace"];
  }
  if (event !== "pull_request" && event !== "merge_group") return required;

  const selected = (check: CiCheck, job: string) => {
    if (selection.checks[check].selected) required.push(job);
  };
  selected("documentation", "documentation");
  selected("workflow-security", "workflow-validation");
  selected("specification-verdict", "specification-verdict");
  selected("extension-lint", "extension-lint");
  selected("source", "verify-pr");
  selected("cli-e2e", "verify-e2e");
  selected("windows", "windows-workspace");
  return required;
};

const readArgument = (name: string) => {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value) throw new Error(`Missing required ${name} argument`);
  return value;
};
export const parseChangedPaths = (raw: string): readonly string[] => {
  const fields = raw.split("\0");
  const paths: string[] = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (!status) continue;
    const firstPath = fields[index++];
    if (!firstPath) return ["__uncertain-change-record__"];
    paths.push(firstPath);
    if (status.startsWith("R") || status.startsWith("C")) {
      const secondPath = fields[index++];
      if (!secondPath) return ["__uncertain-change-record__"];
      paths.push(secondPath);
    } else if (!/^[ADMUTX]$/u.test(status)) {
      return ["__uncertain-change-record__"];
    }
  }
  return paths;
};
const readChangedPaths = (base: string, head: string) =>
  parseChangedPaths(
    execFileSync("git", ["diff", "--name-status", "-z", `${base}...${head}`], {
      encoding: "utf8",
    }),
  );
const outputEntries = (selection: CiSelectionResult, event: string): readonly string[] => [
  `code=${selection.checks.source.selected}`,
  `documentation=${selection.checks.documentation.selected}`,
  `workflow=${selection.workflow}`,
  `workflow_security=${selection.checks["workflow-security"].selected}`,
  `cli_e2e=${selection.checks["cli-e2e"].selected}`,
  `windows=${selection.checks.windows.selected}`,
  `release_artifacts=${selection.checks["release-artifacts"].selected}`,
  `release_preparation=${selection.releasePreparation}`,
  `specification_verdict=${selection.checks["specification-verdict"].selected}`,
  `extension_lint=${selection.checks["extension-lint"].selected}`,
  `required_jobs=${JSON.stringify(requiredCiJobs(selection, event))}`,
  `selection=${JSON.stringify(selection)}`,
];
const renderSummary = (selection: CiSelectionResult) =>
  [
    "## CI selection",
    "",
    `Comparison: \`${selection.base}\` … \`${selection.head}\``,
    "",
    "| Check | Decision | Reason |",
    "| --- | --- | --- |",
    ...Object.entries(selection.checks).map(
      ([name, value]) =>
        `| \`${name}\` | ${value.selected ? "selected" : "inapplicable"} | ${value.reason} |`,
    ),
    "",
  ].join("\n");
export const validateRunnerCommandFile = (
  candidate: string | undefined,
  runnerTemp: string | undefined,
) => {
  if (!candidate) return undefined;
  if (!runnerTemp) throw new Error("RUNNER_TEMP is required for GitHub command files");
  const root = realpathSync(resolve(runnerTemp));
  const target = realpathSync(resolve(candidate));
  if (!target.startsWith(`${root}${sep}`)) {
    throw new Error("GitHub command files must be contained by RUNNER_TEMP");
  }
  return target;
};
const writeSelection = (selection: CiSelectionResult, event: string) => {
  const runnerTemp = process.env["RUNNER_TEMP"];
  const outputPath = validateRunnerCommandFile(process.env["GITHUB_OUTPUT"], runnerTemp);
  if (outputPath) appendFileSync(outputPath, `${outputEntries(selection, event).join("\n")}\n`);
  const summaryPath = validateRunnerCommandFile(process.env["GITHUB_STEP_SUMMARY"], runnerTemp);
  if (summaryPath) appendFileSync(summaryPath, renderSummary(selection));
  console.log(JSON.stringify(selection, null, 2));
};
const main = () => {
  const base = readArgument("--base");
  const head = readArgument("--head");
  const event = process.env["EVENT_NAME"] ?? "";
  const ref = process.env["REF_NAME"] ?? "";
  const headRef = process.env["HEAD_REF"] ?? "";
  const headRepository = process.env["HEAD_REPOSITORY"] ?? "";
  const repository = process.env["GITHUB_REPOSITORY"] ?? "";
  const subject = execFileSync("git", ["show", "-s", "--format=%s", head], {
    encoding: "utf8",
  }).trim();
  const subjects =
    event === "pull_request" || event === "merge_group"
      ? execFileSync("git", ["log", "--format=%s", `origin/main..${head}`], {
          encoding: "utf8",
        })
          .trim()
          .split("\n")
      : [];
  const releaseArtifacts = selectsReleaseArtifacts({ event, ref, subject });
  const releasePreparation = detectsReleasePreparation({
    event,
    headRef,
    headRepository,
    repository,
    subjects,
  });
  const paths = readChangedPaths(base, head);
  const selection = {
    ...classifyCiChanges(paths, { releaseArtifacts }),
    base,
    head,
    releasePreparation,
    version: 1,
  } satisfies CiSelectionResult;
  writeSelection(selection, event);
};
const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) main();

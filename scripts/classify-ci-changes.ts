import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export interface CiChangeClassification {
  readonly code: boolean;
  readonly documentation: boolean;
  readonly formatRequired: boolean;
  readonly releaseInfrastructure: boolean;
  readonly workflow: boolean;
}

const isDocumentationPath = (path: string) =>
  path.startsWith("contributing/") || /(?:^|\/)\w[^/]*\.mdx?$/u.test(path);

/**
 * Trees whose files a project owns. Every project root sits under `apps/`,
 * `packages/` or `tools/`, so `default` (`{projectRoot}/**\/*`) already claims
 * the markdown inside them. The remaining prefixes are declared from the
 * workspace root: `apps/cli/project.json` names `skills/axm/src/**\/*` and
 * `README.md` among its `generate:*` inputs and outputs, and the root
 * `project.json` names `specifications/catalog.md` as a `generate:*` output.
 */
const workspaceSourcePrefixes: readonly string[] = [
  "apps/",
  "packages/",
  "tools/",
  "skills/",
  "specifications/",
];

const workspaceSourceFiles: readonly string[] = ["README.md"];

const isWorkspaceSourcePath = (path: string) =>
  workspaceSourcePrefixes.some((prefix) => path.startsWith(prefix)) ||
  workspaceSourceFiles.includes(path);

/**
 * Markdown a project claims as build input is code, not documentation:
 * `pnpm run generate:check` is the only gate that catches a hand edit to a
 * generated document, and it runs inside the affected-verification lane that
 * `code` selects. `classify-ci-changes.test.ts` derives the markdown entries
 * from every project manifest rather than restating them here.
 */
const isDocumentationOnlyPath = (path: string) =>
  isDocumentationPath(path) && !isWorkspaceSourcePath(path);

const isReleaseInfrastructurePath = (path: string) =>
  path.startsWith("infra/") ||
  path.startsWith("scripts/release-") ||
  path === ".github/workflows/publish.yml" ||
  path === "mise.toml" ||
  path === "nx.json" ||
  path === "package.json" ||
  path === "pnpm-lock.yaml" ||
  path === "project.json";

export const selectCodeVerificationPaths = (paths: readonly string[]) =>
  paths.filter((path) => !isDocumentationOnlyPath(path) && !path.startsWith(".github/"));

export const classifyCiChanges = (paths: readonly string[]): CiChangeClassification => {
  const documentation = paths.some(isDocumentationPath);
  const workflow = paths.some((path) => path.startsWith(".github/"));
  const releaseInfrastructure = paths.some(isReleaseInfrastructurePath);
  const codeVerificationPaths = selectCodeVerificationPaths(paths);

  return {
    code: codeVerificationPaths.length > 0 || releaseInfrastructure,
    documentation,
    formatRequired: true,
    releaseInfrastructure,
    workflow,
  };
};

const readArgument = (name: string) => {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value) throw new Error(`Missing required ${name} argument`);
  return value;
};

const readChangedPaths = (base: string, head: string) =>
  execFileSync("git", ["diff", "--name-only", "-z", `${base}...${head}`], {
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);

const writeGitHubOutputs = (classification: CiChangeClassification) => {
  const outputPath = process.env["GITHUB_OUTPUT"];
  if (!outputPath) return;

  appendFileSync(
    outputPath,
    [
      `code=${classification.code}`,
      `documentation=${classification.documentation}`,
      `format_required=${classification.formatRequired}`,
      `release_infrastructure=${classification.releaseInfrastructure}`,
      `workflow=${classification.workflow}`,
      "",
    ].join("\n"),
  );
};

const main = () => {
  const base = readArgument("--base");
  const head = readArgument("--head");
  const paths = readChangedPaths(base, head);
  const classification = classifyCiChanges(paths);

  writeGitHubOutputs(classification);
  console.log(JSON.stringify(classification, null, 2));
};

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) main();

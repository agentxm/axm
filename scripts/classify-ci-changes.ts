import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export interface CiChangeClassification {
  readonly code: boolean;
  readonly documentation: boolean;
  readonly formatRequired: boolean;
  readonly image: boolean;
  readonly releaseInfrastructure: boolean;
  readonly workflow: boolean;
}

const isDocumentationPath = (path: string) =>
  path.startsWith("contributing/") || /(?:^|\/)\w[^/]*\.mdx?$/u.test(path);

const isImagePath = (path: string) =>
  path.startsWith("containers/ci/") ||
  path === "scripts/check-ci-image.mjs" ||
  path === ".github/workflows/ci-image.yml" ||
  path === ".github/workflows/ci-image-publish.yml";

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
  paths.filter(
    (path) => !isDocumentationPath(path) && !path.startsWith(".github/") && !isImagePath(path),
  );

export const classifyCiChanges = (paths: readonly string[]): CiChangeClassification => {
  const documentation = paths.some(isDocumentationPath);
  const image = paths.some(isImagePath);
  const workflow = paths.some((path) => path.startsWith(".github/"));
  const releaseInfrastructure = paths.some(isReleaseInfrastructurePath);
  const codeVerificationPaths = selectCodeVerificationPaths(paths);

  return {
    code: codeVerificationPaths.length > 0 || releaseInfrastructure,
    documentation,
    formatRequired: true,
    image,
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
      `image=${classification.image}`,
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

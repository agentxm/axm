import { readdirSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const errors = [];
const containerfile = read("containers/ci/Containerfile");
const dockerignore = read("containers/ci/.dockerignore");
const ciImagePin = read("containers/ci/CI_IMAGE").trim();
const version = read("containers/ci/VERSION").trim();
const affectedCiRunner = read("scripts/verify-affected-ci.sh");
const ciWorkflow = read(".github/workflows/ci.yml");
const releaseWorkflow = read(".github/workflows/publish.yml");
const nxManifest = JSON.parse(read("nx.json"));
const packageManifest = JSON.parse(read("package.json"));
const workspaceConfig = read("pnpm-workspace.yaml");
const project = read("project.json");
const projectManifest = JSON.parse(project);
const workflow = read(".github/workflows/ci-image.yml");
const publishWorkflow = read(".github/workflows/ci-image-publish.yml");
const workflowSources = readdirSync(".github/workflows")
  .filter((path) => path.endsWith(".yml") || path.endsWith(".yaml"))
  .map((path) => [path, read(`.github/workflows/${path}`)]);
const containerLauncher = read("scripts/container-environment.sh");
const mise = read("mise.toml");

const packageManagerPnpmMatch = /^pnpm@(\d+\.\d+\.\d+)$/u.exec(
  packageManifest.packageManager ?? "",
);
const ciImageVersionMatch = /^ghcr\.io\/agentxm\/axm-ci:(\d+\.\d+\.\d+)@sha256:[0-9a-f]{64}$/u.exec(
  ciImagePin,
);
const imageNodeMatch = /^ARG NODE_VERSION=(\d+\.\d+\.\d+)$/mu.exec(containerfile);
const imageBunMatch = /^ARG BUN_VERSION=(\d+\.\d+\.\d+)$/mu.exec(containerfile);
const imagePnpmMatch = /^ARG PNPM_VERSION=(\d+\.\d+\.\d+)$/mu.exec(containerfile);
const miseNodeMatch = /^node\s*=\s*"([^"]+)"$/mu.exec(mise);
const miseBunMatch = /^bun\s*=\s*"([^"]+)"$/mu.exec(mise);
const candidateSmokeMatch = /^smoke_ci_image\(\) \{([\s\S]*?)^\}$/mu.exec(containerLauncher);
const activeSmokeMatch = /^smoke\(\) \{([\s\S]*?)^\}$/mu.exec(containerLauncher);
const activeImageVersion = ciImageVersionMatch?.[1];
const imageNodeVersion = imageNodeMatch?.[1];
const imageBunVersion = imageBunMatch?.[1];
const packageManagerPnpmVersion = packageManagerPnpmMatch?.[1];
const imagePnpmVersion = imagePnpmMatch?.[1];
const miseNodeVersion = miseNodeMatch?.[1];
const miseBunVersion = miseBunMatch?.[1];
const candidateSmoke = candidateSmokeMatch?.[1] ?? "";
const activeSmoke = activeSmokeMatch?.[1] ?? "";

const requireText = (subject, text, message) => {
  if (!subject.includes(text)) errors.push(message);
};

if (publishWorkflow.includes("containers/ci/**")) {
  errors.push("CI image publication must not run for consumer-only CI_IMAGE changes");
}
for (const path of [
  "containers/ci/Containerfile",
  "containers/ci/.dockerignore",
  "containers/ci/VERSION",
  ".github/workflows/ci-image.yml",
]) {
  requireText(publishWorkflow, path, `CI image publication must watch producer input ${path}`);
}
if (workflow.includes("--metadata-file")) {
  errors.push(
    "CI image promotion must resolve its digest by registry inspection for runner Buildx compatibility",
  );
}

if (!/^\d+\.\d+\.\d+$/u.test(version)) {
  errors.push("containers/ci/VERSION must contain one semantic version");
}

if (activeImageVersion === undefined) {
  errors.push("containers/ci/CI_IMAGE must pin a semantic axm-ci tag by digest");
}

if (/^\s*(?:ADD|COPY)\s/imu.test(containerfile)) {
  errors.push("the AXM CI image must not copy repository files into a layer");
}

if (!/^ARG UBUNTU_IMAGE=[^@\n]+@sha256:[0-9a-f]{64}$/mu.test(containerfile)) {
  errors.push("the AXM CI image base must use a full immutable digest");
}

if (imageNodeVersion === undefined) {
  errors.push("Containerfile must pin an exact NODE_VERSION");
} else {
  requireText(
    candidateSmoke,
    `test "$(node --version)" = "v${imageNodeVersion}"`,
    "local candidate-image smoke test Node version must match Containerfile",
  );
}

if (imageBunVersion === undefined) {
  errors.push("Containerfile must pin an exact BUN_VERSION");
} else {
  requireText(
    candidateSmoke,
    `test "$(bun --version)" = "${imageBunVersion}"`,
    "local candidate-image smoke test Bun version must match Containerfile",
  );
}

if (miseNodeVersion === undefined) {
  errors.push("mise.toml must declare Node");
}
if (miseBunVersion === undefined) {
  errors.push("mise.toml must declare Bun");
}

const nodePinMatches = (miseVersion, exactVersion) =>
  miseVersion === exactVersion ||
  (/^\d+$/u.test(miseVersion ?? "") && exactVersion?.startsWith(`${miseVersion}.`));

const producerFirstUpgrade =
  activeImageVersion !== undefined &&
  /^\d+\.\d+\.\d+$/u.test(version) &&
  activeImageVersion !== version;

if (producerFirstUpgrade) {
  const activeSmokeNodeMatch = /test "\$\(node --version\)" = "v(\d+\.\d+\.\d+)"/u.exec(
    activeSmoke,
  );
  const activeSmokeBunMatch = /test "\$\(bun --version\)" = "(\d+\.\d+\.\d+)"/u.exec(activeSmoke);
  if (!nodePinMatches(miseNodeVersion, activeSmokeNodeMatch?.[1])) {
    errors.push("producer-first mise Node pin must match the active-image smoke check");
  }
  if (miseBunVersion !== activeSmokeBunMatch?.[1]) {
    errors.push("producer-first mise Bun pin must match the active-image smoke check");
  }
} else {
  if (!nodePinMatches(miseNodeVersion, imageNodeVersion)) {
    errors.push("mise Node pin must match the active CI image");
  }
  if (miseBunVersion !== imageBunVersion) {
    errors.push("mise Bun pin must match the active CI image");
  }
}

if (
  packageManagerPnpmVersion === undefined ||
  Number.parseInt(packageManagerPnpmVersion, 10) < 11
) {
  errors.push("package.json packageManager must pin an exact pnpm 11+ version");
} else {
  requireText(
    mise,
    `"npm:pnpm" = "${packageManagerPnpmVersion}"`,
    "mise.toml npm:pnpm version must match packageManager",
  );

  const releaseSetupCount =
    releaseWorkflow.split(`corepack prepare pnpm@${packageManagerPnpmVersion} --activate`).length -
    1;
  if (releaseSetupCount !== 2) {
    errors.push("both release jobs must activate the packageManager pnpm version");
  }
}

if (imagePnpmVersion === undefined) {
  errors.push("Containerfile must pin an exact PNPM_VERSION");
} else {
  requireText(
    containerfile,
    `mise install "npm:pnpm@\${PNPM_VERSION}"`,
    "Containerfile must install pnpm through mise's npm backend",
  );
  const nodeActivationIndex = containerfile.indexOf(`mise use --global "node@\${NODE_VERSION}"`);
  const pnpmInstallIndex = containerfile.indexOf(`mise install "npm:pnpm@\${PNPM_VERSION}"`);
  if (nodeActivationIndex === -1 || nodeActivationIndex >= pnpmInstallIndex) {
    errors.push("Containerfile must activate Node before using mise's npm backend");
  }
  requireText(
    containerfile,
    `mise use --global "node@\${NODE_VERSION}" "npm:pnpm@\${PNPM_VERSION}" "bun@\${BUN_VERSION}"`,
    "Containerfile global tool configuration must use mise's npm pnpm backend",
  );
  requireText(
    workflow,
    `test "$(pnpm --version)" = "${imagePnpmVersion}"`,
    "CI image smoke test pnpm version must match Containerfile",
  );
  requireText(
    containerLauncher,
    `test "$(pnpm --version)" = "${imagePnpmVersion}"`,
    "local CI image smoke test pnpm version must match Containerfile",
  );
}

requireText(
  containerfile,
  "python3-yaml",
  "Containerfile must install the Python yaml module required by Gen Stack validation",
);
for (const [subject, message] of [
  [workflow, "CI image workflow smoke test must import Python yaml"],
  [candidateSmoke, "local candidate-image smoke test must import Python yaml"],
]) {
  requireText(subject, 'python3 -c "import yaml"', message);
}

for (const text of [
  "allowBuilds:",
  '"@swc/core": true',
  "esbuild: true",
  "msgpackr-extract: false",
  "nx: true",
  "minimumReleaseAge: 1440",
  '- "@agentxm/*"',
  "- axm.sh",
]) {
  requireText(workspaceConfig, text, `pnpm-workspace.yaml is missing ${text}`);
}
if (workspaceConfig.includes("onlyBuiltDependencies:")) {
  errors.push("pnpm-workspace.yaml must use pnpm 11 allowBuilds");
}

const storeConfigOccurrences =
  containerLauncher.match(/--env pnpm_config_store_dir=/gu)?.length ?? 0;
if (storeConfigOccurrences !== 1 || containerLauncher.includes("--env npm_config_store_dir=")) {
  errors.push("the CI container launcher must pass its pnpm store through pnpm_config_store_dir");
}

for (const text of [
  'org.opencontainers.image.source="https://github.com/agentxm/axm"',
  'org.opencontainers.image.title="axm-ci"',
  "ARG ACTIONLINT_VERSION=1.7.12",
  "ENTRYPOINT",
]) {
  requireText(containerfile, text, `Containerfile is missing ${text}`);
}

for (const variable of [
  "AXM_HOST_UID",
  "AXM_HOST_GID",
  "AXM_DEPS_DIRS",
  "AXM_CI_PHASE_SUMMARY_FILE",
  "AXM_EXPECT_NX_CACHE_HIT",
  "AXM_RELEASE_PREPARATION",
]) {
  requireText(
    containerLauncher,
    `--env ${variable}=`,
    `container launcher must pass ${variable} to the image entrypoint`,
  );
}

for (const cacheVolume of ["CI_PNPM_CACHE_VOLUME", "CI_NX_CACHE_VOLUME"]) {
  requireText(
    containerLauncher,
    `ensure_ci_cache_source "$${cacheVolume}"`,
    `container launcher must prepare the scoped ${cacheVolume} cache`,
  );
}

requireText(
  containerLauncher,
  '--volume "$CI_PNPM_CACHE_VOLUME:/tmp/axm-home/.local/share/pnpm/store"',
  "container launcher must mount the scoped pnpm cache at the pnpm store",
);
requireText(
  containerLauncher,
  '--volume "$CI_NX_CACHE_VOLUME:/tmp/axm-home/.cache/nx"',
  "container launcher must persist Nx task artifacts with their database metadata",
);
if (containerLauncher.includes('--volume "$CI_NX_CACHE_VOLUME:/tmp/axm-home/.cache/nx/cache"')) {
  errors.push(
    "container launcher must not separate Nx task artifacts from their database metadata",
  );
}
if (containerLauncher.includes("NX_REJECT_UNKNOWN_LOCAL_CACHE")) {
  errors.push("container launcher must not bypass Nx cache provenance checks");
}

for (const text of [
  "affected_projects: ${{ steps.classify.outputs.affected_projects }}",
  "id: pnpm-cache",
  "id: nx-cache",
  "axm-ci-cache/pnpm-store",
  "axm-ci-cache/nx",
  "hashFiles('containers/ci/CI_IMAGE')",
  'AXM_CONTAINER_NX_PARALLEL: "3"',
  'AXM_CONTAINER_VITEST_MAX_WORKERS: "2"',
  "AXM_EXPECT_NX_CACHE_HIT: ${{ steps.nx-cache.outputs.cache-hit }}",
  "scripts/verify-affected-ci.sh",
  "if: always()",
  '>> "$GITHUB_STEP_SUMMARY"',
  "Exact hit",
  "Fallback hit",
  "Miss",
]) {
  requireText(ciWorkflow, text, `CI workflow is missing ${text}`);
}

if (
  !/key:\s*>-\s+axm-ci-nx-v2-[\s\S]{0,500}github\.event\.pull_request\.head\.sha\s*\}\}\s+restore-keys:/u.test(
    ciWorkflow,
  )
) {
  errors.push("the Nx cache must use a commit-specific primary key");
}

for (const text of [
  "::group::%s",
  'run_phase "Install workspace dependencies"',
  'run_phase "Validate release plan"',
  "pnpm release:plan:check",
  'run_phase "Validate CI image contract"',
  'run_phase "Validate generated artifacts"',
  'run_phase "Validate workspace synchronization"',
  "nx affected -t lint typecheck build test e2e",
  "-t scripts-lint scripts-typecheck scripts-test verify-e2e-boundaries",
  "validate_restored_nx_cache",
  "An exact Actions cache hit produced no Nx task hits",
]) {
  requireText(affectedCiRunner, text, `affected CI runner is missing ${text}`);
}

const workflowFormatChecks = ciWorkflow.match(/pnpm run format:check/gu) ?? [];
if (workflowFormatChecks.length !== 1) {
  errors.push("the PR workflow must have exactly one formatting owner");
}

if (packageManifest.scripts?.["generate:check"]?.includes("format:check")) {
  errors.push("generate:check must not duplicate the PR formatting check");
}

if (
  !nxManifest.targetDefaults?.test?.outputs?.includes("{workspaceRoot}/test-results/{projectName}")
) {
  errors.push("cached test targets must restore their JUnit reports");
}

if (
  !projectManifest.targets?.["scripts-test"]?.outputs?.includes(
    "{workspaceRoot}/test-results/scripts",
  )
) {
  errors.push("the cached scripts test target must restore its JUnit report");
}

requireText(
  project,
  '"command": "pnpm exec nx format:check"',
  "local verification must retain its formatting check",
);

for (const scopeInput of ['"axm|', "$(uname -m)", "$CI_IMAGE", "pnpm-lock.yaml"]) {
  requireText(
    containerLauncher,
    scopeInput,
    `container launcher cache scope is missing ${scopeInput}`,
  );
}

if (/--env AGENTXM_(?:HOST_UID|HOST_GID|DEPS_DIRS)=/u.test(containerLauncher)) {
  errors.push("container launcher uses obsolete AGENTXM_* image entrypoint variables");
}

if (dockerignore.trim() !== "**\n!Containerfile\n!README.md\n!VERSION") {
  errors.push("containers/ci/.dockerignore must keep the image context source-free");
}

for (const text of [
  "ghcr.io/agentxm/axm-ci",
  "linux/amd64",
  "linux/arm64",
  "Scan exact image artifact",
  "Promote validated image artifacts",
  "actions/attest@",
  "Verify anonymous pull and public metadata",
  "workflow_call:",
]) {
  requireText(workflow, text, `CI image workflow is missing ${text}`);
}

for (const [path, source] of workflowSources) {
  for (const match of source.matchAll(/^\s*uses:\s+([^\s#]+)(?:\s+#.*)?$/gmu)) {
    const action = match[1];
    if (action.startsWith("./") || action.startsWith("docker://")) continue;
    const separator = action.lastIndexOf("@");
    const reference = separator === -1 ? "" : action.slice(separator + 1);
    if (!/^[0-9a-f]{40}$/u.test(reference)) {
      errors.push(`${path} action ${action} must use a full commit SHA`);
    }
  }
}

for (const text of ["Required CI failures", "GITHUB_STEP_SUMMARY"]) {
  requireText(
    ciWorkflow,
    text,
    `Required CI rollup must report actionable failure details via ${text}`,
  );
}

if (errors.length > 0) {
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log("AXM CI image contract is valid");
}

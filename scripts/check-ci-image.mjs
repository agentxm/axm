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
const workflowSources = readdirSync(".github/workflows")
  .filter((path) => path.endsWith(".yml") || path.endsWith(".yaml"))
  .map((path) => [path, read(`.github/workflows/${path}`)]);
const containerLauncher = read("scripts/container-environment.sh");
const mise = read("mise.toml");

const packageManagerPnpmMatch = /^pnpm@(\d+\.\d+\.\d+)$/u.exec(
  packageManifest.packageManager ?? "",
);
const imagePnpmMatch = /^ARG PNPM_VERSION=(\d+\.\d+\.\d+)$/mu.exec(containerfile);
const packageManagerPnpmVersion = packageManagerPnpmMatch?.[1];
const imagePnpmVersion = imagePnpmMatch?.[1];

const requireText = (subject, text, message) => {
  if (!subject.includes(text)) errors.push(message);
};

if (!/^\d+\.\d+\.\d+$/u.test(version)) {
  errors.push("containers/ci/VERSION must contain one semantic version");
}

if (!/^ghcr\.io\/agentxm\/axm-ci:\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/u.test(ciImagePin)) {
  errors.push("containers/ci/CI_IMAGE must pin a semantic axm-ci tag by digest");
}

if (/^\s*(?:ADD|COPY)\s/imu.test(containerfile)) {
  errors.push("the AXM CI image must not copy repository files into a layer");
}

if (!/^ARG UBUNTU_IMAGE=[^@\n]+@sha256:[0-9a-f]{64}$/mu.test(containerfile)) {
  errors.push("the AXM CI image base must use a full immutable digest");
}

for (const [manifestPin, imagePin] of [
  [/node\s*=\s*"22"/u, "ARG NODE_VERSION=22.22.2"],
  [/bun\s*=\s*"1\.3\.5"/u, "ARG BUN_VERSION=1.3.5"],
]) {
  if (!manifestPin.test(mise)) errors.push(`mise.toml is missing ${manifestPin}`);
  requireText(containerfile, imagePin, `Containerfile is missing ${imagePin}`);
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
if (storeConfigOccurrences !== 2 || containerLauncher.includes("--env npm_config_store_dir=")) {
  errors.push("container launchers must pass both pnpm stores through pnpm_config_store_dir");
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

if (errors.length > 0) {
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log("AXM CI image contract is valid");
}

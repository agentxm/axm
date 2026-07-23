import { readdirSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const errors = [];
const containerfile = read("containers/ci/Containerfile");
const dockerignore = read("containers/ci/.dockerignore");
const ciImagePin = read("containers/ci/CI_IMAGE").trim();
const version = read("containers/ci/VERSION").trim();
const affectedCiRunner = read("scripts/verify-affected-ci.sh");
const ciWorkflow = read(".github/workflows/ci.yml");
const nxManifest = JSON.parse(read("nx.json"));
const packageManifest = JSON.parse(read("package.json"));
const project = read("project.json");
const projectManifest = JSON.parse(project);
const workflow = read(".github/workflows/ci-image.yml");
const workflowSources = readdirSync(".github/workflows")
  .filter((path) => path.endsWith(".yml") || path.endsWith(".yaml"))
  .map((path) => [path, read(`.github/workflows/${path}`)]);
const containerLauncher = read("scripts/container-environment.sh");
const mise = read("mise.toml");

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
  [/pnpm\s*=\s*"10\.29\.3"/u, "ARG PNPM_VERSION=10.29.3"],
  [/bun\s*=\s*"1\.3\.5"/u, "ARG BUN_VERSION=1.3.5"],
]) {
  if (!manifestPin.test(mise)) errors.push(`mise.toml is missing ${manifestPin}`);
  requireText(containerfile, imagePin, `Containerfile is missing ${imagePin}`);
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
  requireText(
    containerLauncher,
    `--volume "$${cacheVolume}:`,
    `container launcher must mount the scoped ${cacheVolume} cache`,
  );
}

for (const text of [
  "affected_projects: ${{ steps.classify.outputs.affected_projects }}",
  "id: pnpm-cache",
  "id: nx-cache",
  "axm-ci-cache/pnpm-store",
  "axm-ci-cache/nx",
  "hashFiles('containers/ci/CI_IMAGE')",
  'AXM_CONTAINER_NX_PARALLEL: "2"',
  'AXM_CONTAINER_VITEST_MAX_WORKERS: "2"',
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
  !/key:\s*>-\s+axm-ci-nx-v1-[\s\S]{0,500}github\.event\.pull_request\.head\.sha\s*\}\}\s+restore-keys:/u.test(
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

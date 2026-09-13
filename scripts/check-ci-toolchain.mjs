import { readdirSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const errors = [];
const ciWorkflow = read(".github/workflows/ci.yml");
const releaseWorkflow = read(".github/workflows/publish.yml");
const nxManifest = JSON.parse(read("nx.json"));
const packageManifest = JSON.parse(read("package.json"));
const workspaceConfig = read("pnpm-workspace.yaml");
const projectManifest = JSON.parse(read("project.json"));
const cliE2eProjectManifest = JSON.parse(read("apps/cli-e2e/project.json"));
const workflowSources = readdirSync(".github/workflows")
  .filter((path) => /\.ya?ml$/u.test(path))
  .map((path) => [path, read(`.github/workflows/${path}`)]);
const mise = read("mise.toml");
const packageManagerPnpmVersion = /^pnpm@(\d+\.\d+\.\d+)$/u.exec(
  packageManifest.packageManager ?? "",
)?.[1];
const miseNodeVersion = /^node\s*=\s*"([^"]+)"$/mu.exec(mise)?.[1];
const miseBunVersion = /^bun\s*=\s*"([^"]+)"$/mu.exec(mise)?.[1];
const requireText = (subject, text, message) => {
  if (!subject.includes(text)) errors.push(message);
};
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

  const releaseCorepackSetupCount =
    releaseWorkflow.split(`corepack prepare pnpm@${packageManagerPnpmVersion} --activate`).length -
    1;
  if (releaseCorepackSetupCount !== 2) {
    errors.push("both Windows release verification jobs must activate packageManager pnpm");
  }
  requireText(
    releaseWorkflow,
    "uses: ./.github/actions/setup-workspace",
    "the primary release job must use the canonical workspace toolchain setup",
  );
}

// The Windows release-verification matrices cannot use the setup-workspace
// composite — publish.yml records why — so those jobs duplicate mise.toml's
// toolchain versions instead of reading them. Hold the duplication to the
// authority so an installer or package is never verified on an undeclared
// toolchain.
if (miseNodeVersion !== undefined) {
  requireText(
    releaseWorkflow,
    `node-version: ${miseNodeVersion}`,
    "the Corepack installer-verification job must duplicate the mise.toml Node version exactly",
  );
}
if (miseBunVersion !== undefined) {
  requireText(
    releaseWorkflow,
    `bun-version: ${miseBunVersion}`,
    "the Corepack installer-verification job must duplicate the mise.toml Bun version exactly",
  );
}

// One published name per unit of work: workflows reach this checker through
// `pnpm run check:ci-toolchain`, never through its script path.
for (const [workflowPath, source] of workflowSources) {
  if (source.includes("node scripts/check-ci-toolchain.mjs")) {
    errors.push(
      `${workflowPath} must invoke the published check:ci-toolchain name, not the checker's script path`,
    );
  }
}

for (const text of [
  "verifyDepsBeforeRun: error",
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

if (ciWorkflow.includes("affected_projects")) {
  errors.push("the path classifier must not install Nx only to render an affected-project summary");
}

if (
  !/key:\s*>-\s+axm-ci-nx-v2-[\s\S]{0,500}github\.event\.pull_request\.head\.sha\s*\}\}\s+restore-keys:/u.test(
    ciWorkflow,
  )
) {
  errors.push("the Nx cache must use a commit-specific primary key");
}

if (packageManifest.scripts?.["generate:check"]?.includes("format:check")) {
  errors.push("generate:check must not duplicate the PR formatting check");
}

if (
  !nxManifest.targetDefaults?.test?.outputs?.includes("{workspaceRoot}/test-results/{projectName}")
) {
  errors.push("cached test targets must restore their JUnit reports");
}

if (!projectManifest.targets?.test?.outputs?.includes("{workspaceRoot}/test-results/scripts")) {
  errors.push("the cached root test target must restore its JUnit report");
}

const workspaceCi = packageManifest.scripts?.["ci:workspace"] ?? "";
requireText(workspaceCi, "pnpm run format:check", "workspace CI must retain formatting");
requireText(
  packageManifest.scripts?.ci ?? "",
  "pnpm run ci:workspace",
  "full CI must compose the workspace phase",
);
requireText(
  packageManifest.scripts?.ci ?? "",
  "pnpm run test:e2e",
  "full CI must compose the E2E phase",
);

const workspaceVerification = packageManifest.scripts?.["verify:workspace"] ?? "";
for (const text of [
  "pnpm exec nx run-many",
  "-t lint typecheck build test verify-source-hygiene parity-ledger-check lint-bundled-skill",
]) {
  requireText(
    workspaceVerification,
    text,
    `verify:workspace must retain the bounded workspace phase for ${text}`,
  );
}

const affectedVerification = packageManifest.scripts?.["verify:affected"] ?? "";
for (const text of [
  "pnpm exec nx affected",
  "-t lint typecheck build test verify-source-hygiene parity-ledger-check lint-bundled-skill",
]) {
  requireText(
    affectedVerification,
    text,
    `verify:affected must use the native Nx affected path for ${text}`,
  );
}
if (affectedVerification.includes("-t e2e")) {
  errors.push("verify:affected must remain the fast source-only confidence gate");
}

const prVerification = packageManifest.scripts?.["verify:pr"] ?? "";
for (const text of [
  "pnpm run verify:clean",
  "pnpm run format:check",
  "pnpm run verify:affected",
  "pnpm run test:e2e:affected",
]) {
  requireText(prVerification, text, `verify:pr must own the change boundary through ${text}`);
}
// The bundled-skill lint is the only gate over `skills/axm/**`. It reaches the
// developer through the source-verification names, not only the CI job, so a
// local `pnpm run ci` covers what CI's `extension-lint` job covers.
for (const [name, source] of [
  ["verify:workspace", workspaceVerification],
  ["verify:affected", affectedVerification],
]) {
  requireText(
    source,
    "lint-bundled-skill",
    `${name} must run the bundled AXM skill lint alongside the other lint phases`,
  );
}

for (const source of [workspaceVerification, affectedVerification]) {
  if (source.includes("--skip-nx-cache") || source.includes("--excludeTaskDependencies")) {
    errors.push("verification must preserve graph-owned dependencies and valid cache reuse");
  }
}

// Test worker count is a shared Vitest profile, not a per-script flag: a hosted
// runner and a developer workstation need different values from one contract.
// Vitest 5 removed the experimental filesystem module-cache option, so the
// profile owns only the worker policy now.
const testExecutionProfile = read("vitest.execution.ts");
requireText(
  testExecutionProfile,
  'process.env["CI"] ? 2 :',
  "vitest.execution.ts must retain the shared test execution worker profile",
);

for (const [name, source] of [
  ["verify:workspace", workspaceVerification],
  ["verify:affected", affectedVerification],
]) {
  if (source.includes("--maxWorkers")) {
    errors.push(`${name} must take its worker count from vitest.execution.ts, not a pinned flag`);
  }
}

if (nxManifest.parallel !== 2) {
  errors.push("the local Nx default must bound workspace task concurrency at two");
}

const cliE2eTargets = cliE2eProjectManifest.targets ?? {};
const aggregateDependencies = cliE2eTargets.e2e?.dependsOn ?? [];
for (const target of ["e2e-main", "binary-smoke", "install-suite"]) {
  if (!aggregateDependencies.includes(target)) {
    errors.push(`the aggregate E2E target must depend on cli-e2e:${target}`);
  }
  if (cliE2eTargets[target]?.parallelism !== false) {
    errors.push(`cli-e2e:${target} must run exclusively on its machine`);
  }
}
if (cliE2eTargets["e2e-main"]?.cache !== false) {
  errors.push("cli-e2e:e2e-main must remain a fresh, non-cacheable observation leaf");
}
if (!cliE2eTargets["e2e-main"]?.dependsOn?.includes("cli:compile-host")) {
  errors.push("cli-e2e:e2e-main must reuse the graph-owned compiled host artifact");
}
if (cliE2eTargets.e2e?.executor !== "nx:noop") {
  errors.push("the aggregate E2E target must delegate to its component target graph");
}
for (const text of ["generate:check", "sync:check", "format:check"]) {
  if (affectedVerification.includes(text)) {
    errors.push(`verify:affected must leave clean-checkout ${text} to CI`);
  }
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
  console.log("AXM native CI toolchain and verification contracts are valid");
}

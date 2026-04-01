/**
 * Automated release preparation pipeline: preflight -> version -> changelog -> commit -> push.
 *
 * Usage:
 *   pnpm release:prepare -- [--dry-run]
 *
 * Examples:
 *   pnpm release:prepare
 *   pnpm release:prepare -- --dry-run
 */

import {
  releaseChangelog as nxReleaseChangelog,
  releaseVersion as nxReleaseVersion,
} from "nx/release/index.js";

import {
  currentHeadSha,
  fetchOriginMain,
  fail,
  releaseTagFromVersion,
  requireCleanWorkingTree,
  requireMainBranch,
  requireMatchingReleasePackageVersions,
  requireNotBehindOriginMain,
} from "./release-shared.js";
import { run } from "./release-command.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: pnpm release:prepare -- [--dry-run]");
  process.exit(0);
}

const dryRun = args.includes("--dry-run");
const unknownFlags = args.filter((arg) => arg.startsWith("--") && arg !== "--dry-run");
if (unknownFlags.length > 0) {
  fail(`Unknown flag(s): ${unknownFlags.join(", ")}`);
}

const positionalArgs = args.filter((arg) => !arg.startsWith("--"));
if (positionalArgs.length !== 0) {
  fail("Usage: pnpm release:prepare -- [--dry-run]");
}

const preflight = () => {
  console.log("==> Preflight checks");

  requireMainBranch();
  requireCleanWorkingTree();
  run("pnpm", ["format:check"]);
  fetchOriginMain();
  requireNotBehindOriginMain();

  const version = requireMatchingReleasePackageVersions();
  console.log(`  Branch: main`);
  console.log(`  Current version: ${version}`);
  if (dryRun) {
    console.log("  Mode: dry-run");
  }
};

const requireWorkspaceVersion = (workspaceVersion: string | null | undefined): string =>
  workspaceVersion ??
  fail(
    "Expected Nx Release to resolve a fixed workspace version from pending version plans. Run `pnpm release:plan` first.",
  );

const prepareReleaseArtifacts = async () => {
  console.log("\n==> Phase 1: Version pending release plans");
  const { workspaceVersion, projectsVersionData, releaseGraph } = await nxReleaseVersion({
    dryRun,
    deleteVersionPlans: true,
    stageChanges: false,
    gitCommit: false,
    gitTag: false,
    gitPush: false,
  });

  const version = requireWorkspaceVersion(workspaceVersion);
  console.log("\n==> Phase 2: Update changelog");
  await nxReleaseChangelog({
    version,
    versionData: projectsVersionData,
    releaseGraph,
    dryRun,
    createRelease: false,
    stageChanges: false,
    gitCommit: false,
    gitTag: false,
    gitPush: false,
  });

  if (!dryRun) {
    const appliedVersion = requireMatchingReleasePackageVersions();
    if (appliedVersion !== version) {
      fail(`Nx Release reported ${version}, but package versions on disk are ${appliedVersion}.`);
    }
  }

  const tag = releaseTagFromVersion(version);
  console.log(`  Version: ${version}`);
  console.log(`  Tag: ${tag}`);
  return { version, tag };
};

const commitReleaseArtifacts = (tag: string) => {
  console.log("\n==> Phase 3: Commit");
  run("git", ["add", "--all"]);
  run("git", ["commit", "-m", `release: ${tag}`]);
};

const pushReleaseCommit = (tag: string) => {
  console.log("\n==> Phase 4: Push");
  run("git", ["push", "origin", "main"]);

  const sha = currentHeadSha();
  const version = tag.replace("cli-v", "");
  console.log(`\nPrepared ${tag}`);
  console.log(`  Version: ${version}`);
  console.log(`  Tag: ${tag}`);
  console.log(`  Commit: ${sha}`);
  console.log(`  Next: wait for CI on ${sha} to pass, then run pnpm release:publish ${tag}`);
};

const main = async () => {
  preflight();

  const { tag } = await prepareReleaseArtifacts();
  if (dryRun) {
    console.log(`\nDry run complete. Would prepare ${tag} from pending version plans.`);
    return;
  }

  commitReleaseArtifacts(tag);
  pushReleaseCommit(tag);
};

void main().catch((error) => fail(error instanceof Error ? error.message : String(error)));

/**
 * Automated release preparation pipeline with isolated candidate generation.
 *
 * Usage:
 *   pnpm release:prepare -- [--dry-run]
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { capture, captureIn, run, runIn } from "./release-command.js";
import {
  type CandidateWorkspace,
  type ReleasePreparationHost,
  runReleasePreparation,
} from "./release-prepare-orchestration.js";
import {
  PRODUCTION_REGISTRY_PREVIEW_ARGS,
  RELEASE_PROCESS_ENV,
  RELEASE_REPO,
  currentHeadSha,
  fail,
  fetchOriginMain,
  requireCleanWorkingTree,
  requireMainBranch,
  requireMatchingReleasePackageVersions,
  requireNotBehindOriginMain,
} from "./release-shared.js";

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

const readCandidateVersion = (workspace: CandidateWorkspace): string => {
  const packagePath = join(workspace.checkout, "packages", "cli", "package.json");
  const parsed: unknown = JSON.parse(readFileSync(packagePath, "utf8"));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`Expected ${packagePath} to contain a JSON object.`);
  }
  const version = Reflect.get(parsed, "version");
  if (typeof version !== "string") {
    throw new Error(`Expected ${packagePath} to contain a string version field.`);
  }
  return version;
};

const releaseHost: ReleasePreparationHost = {
  preflightSource: (isDryRun) => {
    console.log("==> Source preflight checks");
    requireMainBranch();
    requireCleanWorkingTree();
    run("pnpm", ["format:check"], RELEASE_PROCESS_ENV);
    fetchOriginMain();
    requireNotBehindOriginMain();

    const version = requireMatchingReleasePackageVersions();
    const sourceSha = currentHeadSha();
    console.log("  Branch: main");
    console.log(`  Source commit: ${sourceSha}`);
    console.log(`  Current version: ${version}`);
    if (isDryRun) console.log("  Mode: dry-run");
    return sourceSha;
  },

  preflightRegistry: () => {
    console.log("\n==> Production Registry authentication and contract preflight");
    run("pnpm", PRODUCTION_REGISTRY_PREVIEW_ARGS, RELEASE_PROCESS_ENV);
  },

  allocateCandidateWorkspace: () => {
    const root = mkdtempSync(join(tmpdir(), "axm-release-prepare-"));
    return { root, checkout: join(root, "candidate") };
  },

  initializeCandidateWorkspace: (workspace, sourceSha) => {
    console.log("\n==> Create isolated release candidate checkout");
    run("git", ["worktree", "add", "--detach", workspace.checkout, sourceSha]);
    runIn(workspace.checkout, "pnpm", ["install", "--frozen-lockfile"], RELEASE_PROCESS_ENV);
  },

  prepareCandidate: async (workspace) => {
    console.log("\n==> Generate and validate isolated release candidate");
    runIn(
      workspace.checkout,
      "pnpm",
      ["exec", "nx", "run", "axm:release-prepare-candidate", "--outputStyle=static"],
      RELEASE_PROCESS_ENV,
    );
    const version = readCandidateVersion(workspace);
    return { version, tag: `cli-v${version}` };
  },

  commitCandidate: (workspace, tag) => {
    console.log("\n==> Commit isolated release candidate");
    runIn(workspace.checkout, "git", ["add", "--all"]);
    runIn(workspace.checkout, "git", ["commit", "-m", `release: ${tag}`]);
    return captureIn(workspace.checkout, "git", ["rev-parse", "HEAD"]);
  },

  assertSourceUnchanged: (sourceSha) => {
    const currentSha = capture("git", ["rev-parse", "HEAD"]);
    const status = capture("git", ["status", "--porcelain=v1", "--untracked-files=all"]);
    if (currentSha !== sourceSha || status.length > 0) {
      throw new Error(
        "The invoking checkout changed while the release candidate was prepared; refusing to push the candidate.",
      );
    }
  },

  pushCandidate: (workspace, branch) => {
    console.log("\n==> Push release candidate branch");
    runIn(workspace.checkout, "git", ["push", "origin", `HEAD:refs/heads/${branch}`]);
  },

  createPullRequest: (branch, tag) => {
    console.log("\n==> Create release pull request");
    try {
      run("gh", [
        "pr",
        "create",
        "--repo",
        RELEASE_REPO,
        "--base",
        "main",
        "--head",
        branch,
        "--title",
        `release: ${tag}`,
        "--body",
        `Prepare ${tag} from the pending version plans.`,
      ]);
    } catch (error) {
      throw new Error(
        `The release branch ${branch} was pushed, but pull-request creation failed. Recover with: gh pr create --repo ${RELEASE_REPO} --base main --head ${branch}`,
        { cause: error },
      );
    }
  },

  cleanupCandidateWorkspace: (workspace) => {
    console.log(`\n==> Remove isolated release candidate checkout: ${workspace.root}`);
    if (existsSync(join(workspace.checkout, ".git"))) {
      run("git", ["worktree", "remove", "--force", workspace.checkout]);
    }
    rmSync(workspace.root, { recursive: true, force: true });
  },
};

const main = async () => {
  const result = await runReleasePreparation(dryRun, releaseHost);

  if (result.mode === "dry-run") {
    console.log(`\nDry run complete. ${result.tag} passed the exact candidate preview.`);
    console.log("  Invoking checkout: unchanged");
    console.log("  Registry publication: not run");
    return;
  }

  console.log(`\nPrepared ${result.tag}`);
  console.log(`  Version: ${result.version}`);
  console.log(`  Tag: ${result.tag}`);
  console.log(`  Commit: ${result.commit}`);
  console.log(`  Branch: ${result.branch}`);
  console.log("  Invoking checkout: unchanged");
  console.log(
    `  Next: wait for pull request CI, then squash-merge with subject "release: ${result.tag}".`,
  );
};

void main().catch((error) => fail(error instanceof Error ? error.message : String(error)));

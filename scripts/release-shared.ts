import { readEnvWithDefault } from "@axm.sh/utils/unstable/env";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

export type BumpType = "patch" | "minor" | "major";

type GitHubRun = {
  databaseId: number;
  status: string;
  conclusion: string | null;
  url: string;
};

const NX_ENV = {
  ...process.env,
  NX_TUI: "false",
  NX_DEFAULT_OUTPUT_STYLE: "static",
};

const RELEASE_PREVIEW_PACKAGE_NAME = "axm-release-version-preview";
const RELEASE_TAG_PREFIX = "cli-v";
const SEMVER_IDENTIFIER_PATTERN = "[0-9A-Za-z-]+";
const SEMVER_VERSION_REGEX = new RegExp(
  `^(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)(?:-(?:${SEMVER_IDENTIFIER_PATTERN})(?:\\.${SEMVER_IDENTIFIER_PATTERN})*)?(?:\\+(?:${SEMVER_IDENTIFIER_PATTERN})(?:\\.${SEMVER_IDENTIFIER_PATTERN})*)?$`,
);

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  value != null && typeof value === "object";

export const RELEASE_REPO = readEnvWithDefault(process.env, "GITHUB_REPOSITORY", "agentxm/axm");

export const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
  throw new Error("Unreachable");
};

export const printCommand = (command: string, args: readonly string[]) => {
  console.log(`\n==> ${command} ${args.join(" ")}`);
};

export const run = (command: string, args: readonly string[], env?: NodeJS.ProcessEnv) => {
  printCommand(command, args);
  execFileSync(command, [...args], {
    stdio: "inherit",
    env: env ?? process.env,
  });
};

export const capture = (
  command: string,
  args: readonly string[],
  env?: NodeJS.ProcessEnv,
): string =>
  execFileSync(command, [...args], {
    encoding: "utf8",
    env: env ?? process.env,
  }).trim();

export const tryCapture = (
  command: string,
  args: readonly string[],
  env?: NodeJS.ProcessEnv,
): { ok: true; stdout: string } | { ok: false; stderr: string } => {
  try {
    return {
      ok: true,
      stdout: capture(command, args, env),
    };
  } catch (error) {
    const stderr =
      error instanceof Error && "stderr" in error && typeof error.stderr === "string"
        ? error.stderr.trim()
        : error instanceof Error
          ? error.message
          : String(error);
    return { ok: false, stderr };
  }
};

export const runNx = (...args: readonly string[]) =>
  run("pnpm", ["exec", "nx", ...args, "--outputStyle=static"], NX_ENV);

const readVersionFromJson = (content: string, source: string): string => {
  const parsed: unknown = JSON.parse(content);
  if (!isRecord(parsed)) {
    return fail(`Expected ${source} to contain a JSON object.`);
  }

  const version = Reflect.get(parsed, "version");
  if (typeof version !== "string") {
    return fail(`Expected ${source} to contain a string version field.`);
  }

  return version;
};

export const readPackageVersion = (path: string): string =>
  readVersionFromJson(readFileSync(path, "utf8"), path);

export const readPackageVersionAtRef = (ref: string, path: string): string =>
  readVersionFromJson(git("show", `${ref}:${path}`), `${ref}:${path}`);

export const git = (...args: readonly string[]): string => capture("git", args);

export const fetchOriginMain = () => {
  run("git", ["fetch", "origin", "main"]);
};

export const requireMainBranch = () => {
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  if (branch !== "main") {
    fail(`Must be on main branch (currently on ${branch})`);
  }
};

export const requireCleanWorkingTree = () => {
  const status = git("status", "--porcelain");
  if (status.length > 0) {
    fail("Working tree is not clean. Commit or stash changes first.");
  }
};

export const requireNotBehindOriginMain = () => {
  const behind = git("rev-list", "--count", "HEAD..origin/main");
  if (behind !== "0") {
    fail(`Local main is ${behind} commit(s) behind origin/main. Pull first.`);
  }
};

export const requireHeadAtOriginMain = () => {
  const head = git("rev-parse", "HEAD");
  const remoteHead = git("rev-parse", "origin/main");
  if (head !== remoteHead) {
    fail(`HEAD (${head}) must match origin/main (${remoteHead}) before publishing the release.`);
  }
};

export const requireMatchingPackageVersions = (): string => {
  const coreVersion = readPackageVersion("packages/core/package.json");
  const cliVersion = readPackageVersion("packages/cli/package.json");

  if (coreVersion !== cliVersion) {
    fail(`Version mismatch: core=${coreVersion}, cli=${cliVersion}. Fix before releasing.`);
  }

  return coreVersion;
};

export const requireReleaseCommitMessage = (tag: string) => {
  const subject = git("log", "-1", "--pretty=%s");
  const expected = `release: ${tag}`;
  if (subject !== expected) {
    fail(`HEAD commit must be "${expected}" before publishing (found "${subject}").`);
  }
};

export const parseBumpType = (value: string | undefined): BumpType => {
  if (value === "patch" || value === "minor" || value === "major") {
    return value;
  }

  return fail("Usage: bun scripts/release-prepare.ts <patch|minor|major> [--dry-run]");
};

export const validateReleaseVersion = (version: string, source: string = version): string => {
  if (SEMVER_VERSION_REGEX.test(version)) {
    return version;
  }

  return fail(`Release tag version is not valid semver: ${source}`);
};

export const releaseTagFromVersion = (version: string): string =>
  `${RELEASE_TAG_PREFIX}${validateReleaseVersion(version)}`;

export const validateReleaseTag = (tag: string): string => {
  if (!tag.startsWith(RELEASE_TAG_PREFIX)) {
    return fail(`Release tag must use the ${RELEASE_TAG_PREFIX}{VERSION} format: ${tag}`);
  }

  validateReleaseVersion(tag.slice(RELEASE_TAG_PREFIX.length), tag);
  return tag;
};

export const releaseVersionFromTag = (tag: string): string =>
  validateReleaseVersion(validateReleaseTag(tag).slice(RELEASE_TAG_PREFIX.length), tag);

export const previewVersionBump = (version: string, bumpType: BumpType): string => {
  const currentVersion = validateReleaseVersion(version);
  const tempDir = mkdtempSync(path.join(tmpdir(), "axm-release-version-"));
  const packageJsonPath = path.join(tempDir, "package.json");

  try {
    writeFileSync(
      packageJsonPath,
      JSON.stringify({ name: RELEASE_PREVIEW_PACKAGE_NAME, version: currentVersion }, null, 2),
    );
    execFileSync("npm", ["version", bumpType, "--no-git-tag-version"], {
      cwd: tempDir,
      env: process.env,
      stdio: "ignore",
    });
    return readPackageVersion(packageJsonPath);
  } catch (error) {
    return fail(
      `Failed to preview ${bumpType} version bump from ${currentVersion}: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
};

export const currentHeadSha = (): string => git("rev-parse", "HEAD");

const parseGitHubRuns = (value: string): GitHubRun[] => {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    return fail("Unexpected gh run list response.");
  }

  return parsed.flatMap((item: unknown) => {
    if (!isRecord(item)) {
      return [];
    }

    const databaseId = Reflect.get(item, "databaseId");
    const status = Reflect.get(item, "status");
    const conclusion = Reflect.get(item, "conclusion");
    const url = Reflect.get(item, "url");

    if (
      typeof databaseId === "number" &&
      typeof status === "string" &&
      (typeof conclusion === "string" || conclusion === null) &&
      typeof url === "string"
    ) {
      return [{ databaseId, status, conclusion, url }];
    }

    return [];
  });
};

export const listCiRunsForCommit = (sha: string): GitHubRun[] => {
  const output = capture("gh", [
    "run",
    "list",
    "--repo",
    RELEASE_REPO,
    "--workflow",
    "ci.yml",
    "--commit",
    sha,
    "--event",
    "push",
    "--limit",
    "20",
    "--json",
    "databaseId,status,conclusion,url",
  ]);

  return parseGitHubRuns(output);
};

export const requireSuccessfulCiRun = (sha: string): GitHubRun => {
  const runs = listCiRunsForCommit(sha);
  const successfulRun = runs.find((run) => run.conclusion === "success");
  if (successfulRun != null) {
    return successfulRun;
  }

  const latestRun =
    runs[0] ??
    fail(
      `No CI workflow run found for commit ${sha}. Push the release commit to origin/main first.`,
    );

  if (latestRun.status !== "completed" || latestRun.conclusion == null) {
    return fail(
      `CI workflow for commit ${sha} has not completed successfully yet. Wait for it to finish: ${latestRun.url}`,
    );
  }

  return fail(
    `CI workflow for commit ${sha} concluded with ${latestRun.conclusion}: ${latestRun.url}`,
  );
};

export const requireNoExistingGitHubRelease = (tag: string) => {
  const result = tryCapture("gh", ["release", "view", tag, "--repo", RELEASE_REPO]);
  if (result.ok) {
    fail(`GitHub release ${tag} already exists.`);
  }
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const releaseCommitOnOriginMain = (tag: string): string => {
  const output = git(
    "log",
    "origin/main",
    "--format=%H",
    "--perl-regexp",
    "--grep",
    `^release: ${escapeRegex(tag)}$`,
    "-n",
    "2",
  );

  const matches = output.split("\n").filter((value) => value.length > 0);
  if (matches.length === 0) {
    fail(`No release commit found on origin/main for ${tag}.`);
  }

  if (matches.length > 1) {
    fail(`Multiple release commits found on origin/main for ${tag}. Resolve the ambiguity first.`);
  }

  return matches[0] ?? fail(`No release commit found on origin/main for ${tag}.`);
};

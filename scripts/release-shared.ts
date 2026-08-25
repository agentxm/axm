import { readFileSync, writeFileSync } from "node:fs";
import * as Option from "effect/Option";
import { readEnvWithDefault } from "@agentxm/client-utils/unstable/env";

import {
  AXM_SKILL_CLI_VERSION_METADATA_KEY,
  AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY,
  evaluateAxmSkillCompatibility,
  parseSkillMd,
} from "@agentxm/client-core/unstable/skills";

import { capture, run, tryCapture } from "./release-command.js";

export const RELEASE_PACKAGE_JSON_PATHS = [
  "packages/utils/package.json",
  "packages/core/package.json",
  "packages/cli/package.json",
] as const;

export const AXM_SKILL_MANIFEST_PATH = "skills/axm/skill.json";
export const AXM_SKILL_DOCUMENT_PATH = "skills/axm/src/SKILL.md";
export const AXM_SKILL_GENERATED_PATH = "packages/cli/src/__generated__/bundled-axm-skill.ts";

const RELEASE_VERSION_JSON_PATHS = [
  ...RELEASE_PACKAGE_JSON_PATHS,
  AXM_SKILL_MANIFEST_PATH,
] as const;

export type GitHubRun = {
  databaseId: number;
  status: string;
  conclusion: string | null;
  url: string;
};

const NX_ENV = {
  ...process.env,
  NX_TUI: "false",
  NX_DEFAULT_OUTPUT_STYLE: "static",
  NX_TASKS_RUNNER_DYNAMIC_OUTPUT: "false",
};

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

export interface GeneratedAxmSkillCompatibility extends AxmSkillCompatibilityDeclaration {
  readonly version: string;
}

const readGeneratedStringConstant = (content: string, name: string, source: string): string => {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^export const ${escapedName} = ("(?:[^"\\\\]|\\\\.)*");$`, "m").exec(
    content,
  );
  if (match?.[1] === undefined) throw new Error(`Missing ${name} in ${source}.`);

  const parsed: unknown = JSON.parse(match[1]);
  if (typeof parsed !== "string") throw new Error(`Expected ${name} to be a string in ${source}.`);
  return parsed;
};

export const readGeneratedSkillCompatibilityFromContent = (
  content: string,
  source: string,
): GeneratedAxmSkillCompatibility => ({
  version: readGeneratedStringConstant(content, "AXM_SKILL_VERSION", source),
  cliVersion: readGeneratedStringConstant(content, "AXM_SKILL_CLI_VERSION", source),
  cliVersionRange: readGeneratedStringConstant(content, "AXM_SKILL_CLI_VERSION_RANGE", source),
});

const readGeneratedSkillCompatibility = (
  path: string = AXM_SKILL_GENERATED_PATH,
): GeneratedAxmSkillCompatibility =>
  readGeneratedSkillCompatibilityFromContent(readFileSync(path, "utf8"), path);

const readGeneratedSkillCompatibilityAtRef = (
  ref: string,
  path: string = AXM_SKILL_GENERATED_PATH,
): GeneratedAxmSkillCompatibility =>
  readGeneratedSkillCompatibilityFromContent(git("show", `${ref}:${path}`), `${ref}:${path}`);

export interface AxmSkillCompatibilityDeclaration {
  readonly cliVersion: string;
  readonly cliVersionRange: string;
}

export const readSkillCompatibilityFromContent = (
  content: string,
  source: string,
): AxmSkillCompatibilityDeclaration => {
  const parsedSkill = Option.getOrNull(parseSkillMd(content, "axm"));
  if (parsedSkill === null) throw new Error(`Invalid AXM skill document in ${source}.`);

  const metadata = Option.getOrNull(parsedSkill.metadata);
  const cliVersion = metadata?.[AXM_SKILL_CLI_VERSION_METADATA_KEY];
  const cliVersionRange = metadata?.[AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY];
  if (cliVersion === undefined || cliVersionRange === undefined) {
    throw new Error(`Missing AXM skill compatibility declaration in ${source}.`);
  }

  return { cliVersion, cliVersionRange };
};

export const readSkillCompatibility = (
  path: string = AXM_SKILL_DOCUMENT_PATH,
): AxmSkillCompatibilityDeclaration =>
  readSkillCompatibilityFromContent(readFileSync(path, "utf8"), path);

export const readSkillCompatibilityAtRef = (
  ref: string,
  path: string = AXM_SKILL_DOCUMENT_PATH,
): AxmSkillCompatibilityDeclaration =>
  readSkillCompatibilityFromContent(git("show", `${ref}:${path}`), `${ref}:${path}`);

const replaceExactlyOnce = (
  content: string,
  pattern: RegExp,
  replacement: string,
  source: string,
): string => {
  const matches = content.match(pattern);
  if (matches?.length !== 1) {
    return fail(`Expected exactly one release stamp in ${source}.`);
  }

  return content.replace(pattern, replacement);
};

export const writeSkillVersion = (version: string, path: string = AXM_SKILL_MANIFEST_PATH) => {
  validateReleaseVersion(version);
  const content = readFileSync(path, "utf8");
  const updated = replaceExactlyOnce(
    content,
    /^([ \t]*"version"[ \t]*:[ \t]*)"[^"]+"([ \t]*,?[ \t]*)$/gm,
    `$1"${version}"$2`,
    path,
  );
  writeFileSync(path, updated, "utf8");
};

const requireCompatibleSkillDeclaration = (
  version: string,
  declaration: AxmSkillCompatibilityDeclaration,
  source: string,
): AxmSkillCompatibilityDeclaration => {
  const result = evaluateAxmSkillCompatibility({
    cliVersion: version,
    skill: {
      manifestVersion: version,
      metadata: {
        [AXM_SKILL_CLI_VERSION_METADATA_KEY]: declaration.cliVersion,
        [AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY]: declaration.cliVersionRange,
      },
      source,
    },
  });
  if (result.status !== "compatible") {
    throw new Error(
      `Incompatible AXM skill declaration in ${source}: ${result.reasonCode ?? "unknown"}: ${result.detail ?? "no detail"}`,
    );
  }
  return declaration;
};

/**
 * The release's minor band, e.g. `0.27.11` -> `>=0.27.0 <0.28.0`.
 *
 * An exact pin declares the skill compatible with exactly one CLI build, so
 * every patch release reports a false incompatibility in each workspace until
 * that workspace updates its installed skill. The band stays bounded and
 * wildcard-free, as `validateAxmSkillCliVersionRange` requires, while
 * tolerating patch drift within the minor.
 */
const minorBandRange = (version: string): string => {
  const match = /^(\d+)\.(\d+)\./.exec(version);
  const major = match?.[1];
  const minor = match?.[2];
  if (major === undefined || minor === undefined) {
    return fail(`Cannot derive a compatibility range from version: ${version}`);
  }
  return `>=${major}.${minor}.0 <${major}.${Number(minor) + 1}.0`;
};

/**
 * An exact pin widens to the release's minor band. A previously managed minor
 * band rolls forward when the release crosses that boundary. Any other range
 * is an intentional declaration and is preserved verbatim — the compatibility
 * guard then fails the release when it no longer covers the release version.
 */
export const transitionSkillCompatibility = (
  current: AxmSkillCompatibilityDeclaration,
  releaseVersion: string,
): AxmSkillCompatibilityDeclaration => {
  requireCompatibleSkillDeclaration(current.cliVersion, current, "current AXM skill");
  const currentMinorBand = minorBandRange(current.cliVersion);
  const next = {
    cliVersion: releaseVersion,
    cliVersionRange:
      current.cliVersionRange === current.cliVersion || current.cliVersionRange === currentMinorBand
        ? minorBandRange(releaseVersion)
        : current.cliVersionRange,
  } satisfies AxmSkillCompatibilityDeclaration;
  return requireCompatibleSkillDeclaration(releaseVersion, next, "next AXM skill");
};

export const stampSkillCompatibility = (
  version: string,
  path: string = AXM_SKILL_DOCUMENT_PATH,
) => {
  validateReleaseVersion(version);
  const content = readFileSync(path, "utf8");
  const next = transitionSkillCompatibility(
    readSkillCompatibilityFromContent(content, path),
    version,
  );
  const withVersion = replaceExactlyOnce(
    content,
    /^[ \t]*axm\.sh\/cli-version:[ \t]*.+$/gm,
    `  ${AXM_SKILL_CLI_VERSION_METADATA_KEY}: "${next.cliVersion}"`,
    path,
  );
  const updated = replaceExactlyOnce(
    withVersion,
    /^[ \t]*axm\.sh\/cli-version-range:[ \t]*.+$/gm,
    `  ${AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY}: "${next.cliVersionRange}"`,
    path,
  );
  writeFileSync(path, updated, "utf8");
};

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

const requireMatchingVersions = (
  versions: ReadonlyArray<readonly [path: string, version: string]>,
  source: string,
): string => {
  const firstVersion = versions[0]?.[1] ?? fail(`No release packages configured for ${source}.`);
  const hasMismatch = versions.some(([, version]) => version !== firstVersion);

  if (hasMismatch) {
    const details = versions.map(([filePath, version]) => `${filePath}=${version}`).join(", ");
    fail(`Version mismatch in ${source}: ${details}.`);
  }

  return firstVersion;
};

const requireMatchingReleaseCompatibility = (
  versions: ReadonlyArray<readonly [path: string, version: string]>,
  declaration: AxmSkillCompatibilityDeclaration,
  generated: GeneratedAxmSkillCompatibility,
  source: string,
): string => {
  const version = requireMatchingVersions(versions, source);
  requireCompatibleSkillDeclaration(version, declaration, source);
  validateGeneratedSkillCompatibility(version, declaration, generated, source);

  return version;
};

const failOnReleaseCompatibilityError = (validate: () => string): string => {
  try {
    return validate();
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
};

export const validateGeneratedSkillCompatibility = (
  version: string,
  declaration: AxmSkillCompatibilityDeclaration,
  generated: GeneratedAxmSkillCompatibility,
  source: string,
): void => {
  if (
    generated.version !== version ||
    generated.cliVersion !== declaration.cliVersion ||
    generated.cliVersionRange !== declaration.cliVersionRange
  ) {
    throw new Error(
      `Generated AXM skill mismatch in ${source}: generated version=${generated.version}, cli-version=${generated.cliVersion}, cli-version-range=${generated.cliVersionRange}; canonical version=${version}, cli-version=${declaration.cliVersion}, cli-version-range=${declaration.cliVersionRange}.`,
    );
  }
};

export const requireMatchingReleasePackageVersions = (): string =>
  failOnReleaseCompatibilityError(() =>
    requireMatchingReleaseCompatibility(
      [
        ...RELEASE_VERSION_JSON_PATHS.map(
          (filePath) => [filePath, readPackageVersion(filePath)] as const,
        ),
      ],
      readSkillCompatibility(),
      readGeneratedSkillCompatibility(),
      "working tree",
    ),
  );

export const requireMatchingReleasePackageVersionsAtRef = (ref: string): string =>
  failOnReleaseCompatibilityError(() =>
    requireMatchingReleaseCompatibility(
      [
        ...RELEASE_VERSION_JSON_PATHS.map(
          (filePath) => [filePath, readPackageVersionAtRef(ref, filePath)] as const,
        ),
      ],
      readSkillCompatibilityAtRef(ref),
      readGeneratedSkillCompatibilityAtRef(ref),
      ref,
    ),
  );

export const requireReleaseCommitMessage = (tag: string) => {
  const subject = git("log", "-1", "--pretty=%s");
  const expected = `release: ${tag}`;
  if (subject !== expected) {
    fail(`HEAD commit must be "${expected}" before publishing (found "${subject}").`);
  }
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

export const releaseCommitSubjectPattern = (tag: string): string =>
  `^release: ${escapeRegex(tag)}(?: \\(#[0-9]+\\))?$`;

export const releaseCommitOnOriginMain = (tag: string): string => {
  const output = git(
    "log",
    "origin/main",
    "--format=%H",
    "--perl-regexp",
    "--grep",
    releaseCommitSubjectPattern(tag),
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

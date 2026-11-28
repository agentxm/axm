/** Select the exact source revision for the canonical publication workflow. */

import { appendFileSync } from "node:fs";

import { validateRunnerCommandFile } from "./classify-ci-changes.js";
import { capture } from "./release-command.js";
import {
  isReleaseLikeSubject,
  parseReleaseCommitSubject,
  readVersionFromJson,
  releaseVersionFromTag,
  requireFullSha,
  validateReleaseTag,
} from "./release-identity.js";

interface PublicationSelection {
  readonly eligible: boolean;
  readonly mode: string;
  readonly tag: string;
  readonly sha: string;
  readonly toolingSha: string;
  readonly ciRunId: string;
}

const currentHead = (): string => capture("git", ["rev-parse", "HEAD"]);

/** Find one canonical release commit in the fetched main history. */
const releaseCommitOnOriginMain = (tag: string): string => {
  const rows = capture("git", ["log", "origin/main", "--format=%H%x09%s"]);
  const matches = rows
    .split("\n")
    .filter((row) => row.length > 0)
    .flatMap((row) => {
      const separator = row.indexOf("\t");
      if (separator < 0) return [];
      const subject = row.slice(separator + 1);
      return parseReleaseCommitSubject(subject)?.tag === tag ? [row.slice(0, separator)] : [];
    });
  if (matches.length !== 1 || matches[0] === undefined) {
    throw new Error(`Expected exactly one canonical release commit for ${tag} on origin/main.`);
  }
  return matches[0];
};

const readPackageVersionAtRef = (ref: string, path: string): string =>
  readVersionFromJson(capture("git", ["show", `${ref}:${path}`]), `${ref}:${path}`);

const resolveSelection = (env: NodeJS.ProcessEnv): PublicationSelection => {
  const toolingSha = currentHead();
  const requestedMode = env["REQUESTED_MODE"] || "stable-auto";
  let mode = requestedMode;
  let sha = toolingSha;
  let tag = "";
  let ciRunId = "";
  let eligible = false;

  if (env["EVENT_NAME"] === "workflow_run") {
    mode = "stable-auto";
    const producerSha = env["CI_HEAD_SHA"];
    const producerBranch = env["CI_HEAD_BRANCH"];
    const mainPush = env["CI_EVENT"] === "push" && producerBranch === "main";
    const releaseDispatch =
      env["CI_EVENT"] === "workflow_dispatch" &&
      env["CI_TITLE"] === `Verify release ${producerSha}` &&
      (producerBranch === "main" || producerBranch === `ci-verify/${producerSha}`);
    if (env["CI_CONCLUSION"] !== "success" || !(mainPush || releaseDispatch)) {
      return { eligible, mode, tag, sha, toolingSha, ciRunId };
    }
    sha = requireFullSha(env["CI_HEAD_SHA"] ?? "", "workflow-run head_sha");
    capture("git", ["fetch", "origin", "main", "--no-tags"]);
    capture("git", ["merge-base", "--is-ancestor", sha, "origin/main"]);
    const subject = capture("git", ["show", "-s", "--format=%s", sha]);
    const release = parseReleaseCommitSubject(subject);
    if (release === undefined) {
      if (isReleaseLikeSubject(subject)) {
        throw new Error(`Release-like commit has a noncanonical subject: ${subject}`);
      }
      return { eligible, mode, tag, sha, toolingSha, ciRunId };
    }
    tag = release.tag;
    ciRunId = env["CI_RUN_ID"] ?? "";
    eligible = true;
  } else if (mode === "stable-recovery") {
    const requestedTag = env["RELEASE_TAG"];
    if (!requestedTag) throw new Error("stable-recovery requires release_tag.");
    tag = validateReleaseTag(requestedTag);
    capture("git", ["fetch", "origin", "main", "--no-tags"]);
    sha = releaseCommitOnOriginMain(tag);
    eligible = true;
  } else if (mode === "bootstrap-prerelease") {
    const sourceSha = requireFullSha(env["SOURCE_SHA"] ?? "", "bootstrap-prerelease source_sha");
    if (sha !== sourceSha) {
      throw new Error("bootstrap-prerelease requires the exact checked-out source_sha.");
    }
    capture("git", ["fetch", "origin", "main", "--no-tags"]);
    if (capture("git", ["rev-parse", "origin/main"]) !== sha) {
      throw new Error("Bootstrap prereleases may be published only from current main.");
    }
    eligible = true;
  } else if (mode === "branch-preview") {
    const sourceSha = requireFullSha(env["SOURCE_SHA"] ?? "", "branch-preview source_sha");
    sha = sourceSha;
    const sourceRef = env["SOURCE_REF"] ?? "";
    if (!/^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/u.test(sourceRef) || sourceRef === "main") {
      throw new Error("branch-preview requires an explicit non-main branch name.");
    }
    capture("git", ["fetch", "origin", sourceRef, "--no-tags"]);
    if (capture("git", ["rev-parse", "FETCH_HEAD"]) !== sha) {
      throw new Error("Branch preview requires the exact current branch head.");
    }
    eligible = true;
  } else {
    throw new Error(`Unknown publication mode: ${mode}`);
  }

  if (tag.length > 0) {
    const manifestVersion = readPackageVersionAtRef(sha, "apps/cli/package.json");
    if (manifestVersion !== releaseVersionFromTag(tag)) {
      throw new Error(`Release tag ${tag} differs from package version ${manifestVersion}.`);
    }
  }
  return { eligible, mode, tag, sha, toolingSha, ciRunId };
};

const outputEntries = (selection: PublicationSelection): readonly string[] => [
  `eligible=${selection.eligible}`,
  `mode=${selection.mode}`,
  `tag=${selection.tag}`,
  `sha=${selection.sha}`,
  `tooling_sha=${selection.toolingSha}`,
  `ci_run_id=${selection.ciRunId}`,
];

const main = (): void => {
  const output = outputEntries(resolveSelection(process.env));
  const outputPath = validateRunnerCommandFile(
    process.env["GITHUB_OUTPUT"],
    process.env["RUNNER_TEMP"],
  );
  if (outputPath !== undefined) appendFileSync(outputPath, `${output.join("\n")}\n`);
  console.log(output.join("\n"));
};

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

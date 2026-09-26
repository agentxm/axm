/** Select the exact source revision for the canonical publication workflow. */

import { appendFileSync } from "node:fs";

import { validateRunnerCommandFile } from "./classify-ci-changes.js";
import { capture } from "./release-command.js";
import {
  isReleaseLikeSubject,
  parseReleaseCommitSubject,
  readPackageVersionAtRef,
  releaseCommitOnOriginMain,
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
    if (
      env["CI_CONCLUSION"] !== "success" ||
      env["CI_EVENT"] !== "push" ||
      env["CI_HEAD_BRANCH"] !== "main"
    ) {
      return { eligible, mode, tag, sha, toolingSha, ciRunId };
    }
    if (sha !== env["CI_HEAD_SHA"]) {
      throw new Error("Workflow-run checkout differs from the completed CI revision.");
    }
    const subject = capture("git", ["show", "-s", "--format=%s", "HEAD"]);
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
    if (sha !== sourceSha) {
      throw new Error("branch-preview requires the exact checked-out source_sha.");
    }
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

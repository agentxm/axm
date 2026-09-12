import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";

import { releaseNotesAtRef } from "./release-notes.js";
import { PublicationHttpError } from "./release-publication.js";
import {
  ensureExactDraftRelease,
  publishExactDraftRelease,
  type GitHubReleaseHost,
  type GitHubReleaseObservation,
} from "./release-github-release.js";
import { run } from "./release-command.js";
import {
  currentHeadSha,
  fail,
  RELEASE_REPO,
  releaseVersionFromTag,
  requireMatchingReleasePackageVersions,
} from "./release-shared.js";

const usage = "Expected <prepare|publish> <cli-vVERSION> <commit-sha>.";
const [mode, tag, sha] = Schema.decodeUnknownSync(
  Schema.Tuple([Schema.Literals(["prepare", "publish"]), Schema.String, Schema.String]),
  { errors: "all" },
)(process.argv.slice(2, 5));
if (process.argv.length !== 5) fail(usage);
if (!/^[0-9a-f]{40}$/u.test(sha)) fail("Expected a full lowercase release commit SHA.");
const version = releaseVersionFromTag(tag);
if (currentHeadSha() !== sha) fail(`Checked-out release commit does not match ${sha}.`);
if (requireMatchingReleasePackageVersions() !== version) {
  fail(`Release package versions do not match ${tag}.`);
}

const token = process.env["GH_TOKEN"];
if (token === undefined || token === "") fail("GH_TOKEN is required for GitHub Release state.");
const apiHeaders = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
};
const encodedTag = encodeURIComponent(tag);
const Ref = Schema.Struct({ object: Schema.Struct({ sha: Schema.String, type: Schema.String }) });
const Release = Schema.Struct({
  draft: Schema.Boolean,
  prerelease: Schema.Boolean,
  html_url: Schema.String,
});

const readJson = async (
  path: string,
  signal: AbortSignal,
): Promise<{ readonly found: false } | { readonly found: true; readonly value: unknown }> => {
  const notFound = { found: false } satisfies { readonly found: false };
  const found = (value: unknown): { readonly found: true; readonly value: unknown } => ({
    found: true,
    value,
  });
  const request = HttpClientRequest.get(
    `https://api.github.com/repos/${RELEASE_REPO}/${path}`,
  ).pipe(HttpClientRequest.setHeaders(apiHeaders));
  const response = await Effect.runPromise(
    HttpClient.execute(request).pipe(Effect.provide(FetchHttpClient.layer)),
    { signal },
  ).catch((cause: unknown) => {
    throw new TypeError(`GitHub ${path} query transport failed.`, { cause });
  });
  if (response.status === 404) return notFound;
  if (response.status !== 200) {
    throw new PublicationHttpError(
      `GitHub ${path} query failed: HTTP ${response.status}.`,
      response.status,
    );
  }
  return Effect.runPromise(response.json, { signal })
    .then(found)
    .catch((cause: unknown) => {
      throw new Error(`GitHub ${path} returned malformed JSON.`, { cause });
    });
};

const read = async (signal: AbortSignal): Promise<GitHubReleaseObservation> => {
  const [tagResult, releaseResult] = await Promise.all([
    readJson(`git/ref/tags/${encodedTag}`, signal),
    readJson(`releases/tags/${encodedTag}`, signal),
  ]);
  const tagSha =
    tagResult.found === false
      ? null
      : (() => {
          const ref = Schema.decodeUnknownSync(Ref)(tagResult.value);
          if (ref.object.type !== "commit") {
            throw new Error(`Release tag ${tag} must point directly to a commit.`);
          }
          return ref.object.sha;
        })();
  const release =
    releaseResult.found === false
      ? null
      : (() => {
          const value = Schema.decodeUnknownSync(Release)(releaseResult.value);
          return { draft: value.draft, prerelease: value.prerelease, url: value.html_url };
        })();
  return { tagSha, release };
};

const withNotesFile = (operation: (path: string) => void): void => {
  const directory = mkdtempSync(join(tmpdir(), "axm-release-notes-"));
  const path = join(directory, "notes.md");
  writeFileSync(path, releaseNotesAtRef(sha, version), "utf8");
  try {
    operation(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const host: GitHubReleaseHost = {
  read,
  createDraft: async (tagExists) => {
    withNotesFile((notesPath) =>
      run("gh", [
        "release",
        "create",
        tag,
        "--repo",
        RELEASE_REPO,
        ...(tagExists ? ["--verify-tag"] : ["--target", sha]),
        "--title",
        tag,
        "--notes-file",
        notesPath,
        "--draft",
      ]),
    );
  },
  publishDraft: async () => {
    run("gh", ["release", "edit", tag, "--repo", RELEASE_REPO, "--draft=false", "--latest"]);
  },
};

const outcome =
  mode === "prepare"
    ? await ensureExactDraftRelease(host, sha)
    : await publishExactDraftRelease(host, sha);
const githubOutput = process.env["GITHUB_OUTPUT"];
if (githubOutput !== undefined && githubOutput !== "") {
  appendFileSync(githubOutput, `outcome=${outcome}\n`, "utf8");
}
console.log(`GitHub Release ${tag}: ${outcome}.`);

import * as Cause from "effect/Cause";
import * as Console from "effect/Console";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import { extractReleaseNotesForVersion } from "./release-notes.js";
import { publicationHttpError } from "./release-publication.js";
import {
  ensureExactDraftRelease,
  publishExactDraftRelease,
  type GitHubReleaseHost,
} from "./release-github-release.js";
import { readGitHubReleaseByTag } from "./release-github-release-api.js";
import { releaseVersionFromTag, requireFullSha } from "./release-identity.js";
import { RELEASE_REPO } from "./release-shared.js";
import { captureReleaseCommand, releaseValidation, runReleaseCommand } from "./release-process.js";
import { readReleaseVersion } from "./release-runtime.js";

const Ref = Schema.Struct({ object: Schema.Struct({ sha: Schema.String, type: Schema.String }) });
const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const [mode, tag, sha] = yield* Schema.decodeUnknownEffect(
    Schema.Tuple([Schema.Literals(["prepare", "publish"]), Schema.String, Schema.String]),
  )(process.argv.slice(2));
  yield* releaseValidation("Validate release commit", () => requireFullSha(sha, "Release commit"));
  const version = yield* releaseValidation("Validate release tag", () =>
    releaseVersionFromTag(tag),
  );
  const sourceVersion = yield* readReleaseVersion(sha);
  yield* releaseValidation("Validate release package versions", () => {
    if (sourceVersion !== version) throw new Error(`Release package versions do not match ${tag}.`);
  });
  const token = yield* Config.Redacted("GH_TOKEN");
  const request = (route: string) =>
    HttpClient.execute(
      HttpClientRequest.get(`https://api.github.com/repos/${RELEASE_REPO}/${route}`).pipe(
        HttpClientRequest.bearerToken(token),
        HttpClientRequest.setHeaders({
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        }),
      ),
    );
  const readTag = Effect.gen(function* () {
    const response = yield* request(`git/ref/tags/${encodeURIComponent(tag)}`);
    if (response.status === 404) return null;
    if (response.status !== 200)
      return yield* Effect.fail(
        publicationHttpError("GitHub tag query failed", response, yield* Clock.currentTimeMillis),
      );
    const ref = yield* Schema.decodeUnknownEffect(Ref)(yield* response.json);
    return yield* releaseValidation("Validate release tag target", () => {
      if (ref.object.type !== "commit")
        throw new Error(`Release tag ${tag} must point directly to a commit.`);
      return ref.object.sha;
    });
  }).pipe(Effect.timeout(30_000));
  const host = {
    read: Effect.all(
      {
        tagSha: readTag,
        release: readGitHubReleaseByTag({
          tag,
          readPage: (page) =>
            Effect.gen(function* () {
              const response = yield* request(`releases?per_page=100&page=${page}`);
              if (response.status !== 200)
                return yield* Effect.fail(
                  publicationHttpError(
                    "GitHub release inventory query failed",
                    response,
                    yield* Clock.currentTimeMillis,
                  ),
                );
              return yield* response.json;
            }).pipe(Effect.timeout(30_000)),
        }),
      },
      { concurrency: 2 },
    ),
    createDraft: (tagExists: boolean) =>
      Effect.scoped(
        Effect.gen(function* () {
          const directory = yield* fs.makeTempDirectoryScoped({ prefix: "axm-release-notes-" });
          const notesPath = path.join(directory, "notes.md");
          const changelog = yield* captureReleaseCommand("git", ["show", `${sha}:CHANGELOG.md`]);
          const notes = yield* releaseValidation("Extract release notes", () =>
            extractReleaseNotesForVersion(changelog, version),
          );
          yield* fs.writeFileString(notesPath, notes);
          yield* runReleaseCommand("gh", [
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
          ]);
        }),
      ),
    publishDraft: (releaseId: number) =>
      runReleaseCommand("gh", [
        "api",
        "--method",
        "PATCH",
        `repos/${RELEASE_REPO}/releases/${releaseId}`,
        "-F",
        "draft=false",
        "-f",
        "make_latest=true",
      ]),
  };
  type HostEffect =
    typeof host.read | ReturnType<typeof host.createDraft> | ReturnType<typeof host.publishDraft>;
  const releaseHost: GitHubReleaseHost<
    Effect.Error<HostEffect>,
    Effect.Services<HostEffect>
  > = host;
  const outcome = yield* mode === "prepare"
    ? ensureExactDraftRelease(releaseHost, sha)
    : publishExactDraftRelease(releaseHost, sha);
  const output = process.env["GITHUB_OUTPUT"];
  if (output !== undefined && output !== "") {
    yield* fs.writeFileString(output, `outcome=${outcome}\n`, { flag: "a" });
  }
  yield* Console.log(`GitHub Release ${tag}: ${outcome}.`);
});

NodeRuntime.runMain(
  program.pipe(
    Effect.tapCause((cause) => Console.error(Cause.pretty(cause))),
    Effect.provide([NodeServices.layer, FetchHttpClient.layer]),
    Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error", cache: "no-store" }),
  ),
  { disableErrorReporting: true },
);

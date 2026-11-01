import * as Cause from "effect/Cause";
import * as Console from "effect/Console";
/** Resolve an exact main revision and cohort state for Actions preparation. */
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { validateRunnerCommandFile } from "./classify-ci-changes.js";
import { validateReleasePreparationSource } from "./release-preflight.js";
import { requireInitializedNpmPackages } from "./release-publication.js";
import { RELEASE_PACKAGES } from "./release-shared.js";
import { captureReleaseCommand, releaseValidation, runReleaseCommand } from "./release-process.js";
import { readReleaseVersion } from "./release-runtime.js";

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const sourceSha = yield* Config.String("AXM_RELEASE_SOURCE_SHA");
  const outputPath = yield* releaseValidation("Validate release output path", () => {
    const path = validateRunnerCommandFile(
      process.env["GITHUB_OUTPUT"],
      process.env["RUNNER_TEMP"],
    );
    if (path === undefined)
      throw new Error("GITHUB_OUTPUT is required when resolving a release preparation source.");
    return path;
  });
  const status = yield* captureReleaseCommand("git", ["status", "--porcelain"]);
  yield* releaseValidation("Validate clean working tree", () => {
    if (status.length > 0)
      throw new Error("Working tree is not clean. Commit or stash changes first.");
  });
  yield* runReleaseCommand("git", ["fetch", "origin", "main"]);
  const version = yield* readReleaseVersion();
  const headSha = yield* captureReleaseCommand("git", ["rev-parse", "HEAD"]);
  const originMainSha = yield* captureReleaseCommand("git", ["rev-parse", "origin/main"]);
  yield* releaseValidation("Validate preparation source", () =>
    validateReleasePreparationSource(sourceSha, headSha, originMainSha),
  );
  yield* requireInitializedNpmPackages(RELEASE_PACKAGES.map((pkg) => pkg.name));
  yield* Console.log(`  Source commit: ${sourceSha}\n  Current version: ${version}`);
  yield* fs.writeFileString(outputPath, `source_sha=${sourceSha}\ncurrent_version=${version}\n`, {
    flag: "a",
  });
});

NodeRuntime.runMain(
  program.pipe(
    Effect.tapCause((cause) => Console.error(Cause.pretty(cause))),
    Effect.provide([NodeServices.layer, FetchHttpClient.layer]),
    Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error", cache: "no-store" }),
  ),
  { disableErrorReporting: true },
);

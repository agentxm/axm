import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Cause from "effect/Cause";
import * as Config from "effect/Config";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import { releaseVersionFromTag, requireFullSha } from "./release-identity.js";
import { captureReleaseCommand, releaseValidation } from "./release-process.js";
import { readReleaseVersion, releaseSnapshotLayer } from "./release-runtime.js";

const usage = "Usage: pnpm resolve-release-meta -- <cli-vX.Y.Z> [expected-commit-sha]";
const program = Effect.gen(function* () {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) return yield* Console.log(usage);
  yield* releaseValidation("Validate release metadata arguments", () => {
    if (args.length > 2) throw new Error(usage);
  });
  const tag = args[0] ?? (yield* Config.String("RELEASE_TAG"));
  const version = yield* releaseValidation("Validate release tag", () =>
    releaseVersionFromTag(tag),
  );
  const expectedSha =
    args[1] ?? Option.getOrUndefined(yield* Config.option(Config.String("RELEASE_SHA")));
  if (expectedSha !== undefined)
    yield* releaseValidation("Validate expected release commit", () =>
      requireFullSha(expectedSha, "Expected release commit"),
    );
  return yield* Effect.gen(function* () {
    const releaseVersion = yield* readReleaseVersion;
    yield* releaseValidation("Validate release package versions", () => {
      if (releaseVersion !== version)
        throw new Error(
          `Release package versions (${releaseVersion}) do not match release tag (${version}).`,
        );
    });
    const sha = expectedSha ?? (yield* captureReleaseCommand("git", ["rev-list", "-n", "1", tag]));
    const githubOutput = yield* Config.String("GITHUB_OUTPUT").pipe(Config.withDefault(""));
    if (githubOutput !== "") {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(githubOutput, `tag=${tag}\nversion=${version}\nsha=${sha}\n`, {
        flag: "a",
      });
    }
    yield* Console.log(`tag=${tag}\nversion=${version}\nsha=${sha}`);
  }).pipe(Effect.provide(releaseSnapshotLayer(expectedSha)));
});

NodeRuntime.runMain(
  program.pipe(
    Effect.provide(NodeServices.layer),
    Effect.tapCause((cause) => Console.error(Cause.pretty(cause))),
  ),
  { disableErrorReporting: true },
);

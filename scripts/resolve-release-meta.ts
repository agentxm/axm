import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Cause from "effect/Cause";
import * as Config from "effect/Config";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import { releaseVersionFromTag, requireFullSha } from "./release-identity.js";
import { releaseValidation } from "./release-process.js";
import { readReleaseVersion, releaseSnapshotLayer } from "./release-runtime.js";

const program = Effect.gen(function* () {
  const [tag, sha] = yield* Schema.decodeUnknownEffect(
    Schema.Tuple([Schema.String, Schema.String]),
  )(process.argv.slice(2));
  const version = yield* releaseValidation("Validate release tag", () =>
    releaseVersionFromTag(tag),
  );
  yield* releaseValidation("Validate expected release commit", () =>
    requireFullSha(sha, "Expected release commit"),
  );
  return yield* Effect.gen(function* () {
    const releaseVersion = yield* readReleaseVersion;
    yield* releaseValidation("Validate release package versions", () => {
      if (releaseVersion !== version)
        throw new Error(
          `Release package versions (${releaseVersion}) do not match release tag (${version}).`,
        );
    });
    const githubOutput = yield* Config.String("GITHUB_OUTPUT").pipe(Config.withDefault(""));
    if (githubOutput !== "") {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(githubOutput, `tag=${tag}\nversion=${version}\nsha=${sha}\n`, {
        flag: "a",
      });
    }
    yield* Console.log(`tag=${tag}\nversion=${version}\nsha=${sha}`);
  }).pipe(Effect.provide(releaseSnapshotLayer(sha)));
});

NodeRuntime.runMain(
  program.pipe(
    Effect.provide(NodeServices.layer),
    Effect.tapCause((cause) => Console.error(Cause.pretty(cause))),
  ),
  { disableErrorReporting: true },
);

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Cause from "effect/Cause";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import { EXPECTED_BINARY_ASSETS } from "./release-checksums.js";
import { releaseContentArtifactName } from "./release-content.js";
import { releaseValidation, runReleaseCommand } from "./release-process.js";
import {
  releaseRepository,
  releaseCiArtifacts,
  successfulReleaseCiRun,
  successfulReleaseCiRunById,
} from "./release-runtime.js";

const usage =
  "Usage: pnpm download-ci-artifacts -- <commit-sha> <release-output-dir> <npm-output-dir> [ci-run-id]";
const program = Effect.gen(function* () {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) return yield* Console.log(usage);
  const parsedRunId = yield* releaseValidation("Validate artifact download arguments", () => {
    if (args.length < 3 || args.length > 4) throw new Error(usage);
    const runId = args[3] === undefined ? undefined : Number(args[3]);
    if (runId !== undefined && (!Number.isSafeInteger(runId) || runId < 1))
      throw new Error("Invalid exact CI run ID.");
    return runId;
  });
  const [sha, outputDir, npmOutputDir] = yield* Schema.decodeUnknownEffect(
    Schema.Tuple([Schema.String, Schema.String, Schema.String]),
  )(args.slice(0, 3));
  const repository = yield* releaseRepository;
  const ciRun = yield* parsedRunId === undefined
    ? successfulReleaseCiRun(repository, sha)
    : successfulReleaseCiRunById(repository, parsedRunId, sha, "push");
  const binaries = EXPECTED_BINARY_ASSETS.map((asset) => `axm-binary-${asset}-${sha}`);
  const content = releaseContentArtifactName(sha);
  const npm = `axm-npm-cohort-${sha}`;
  yield* releaseCiArtifacts(repository, ciRun, [...binaries, content, npm]);
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(outputDir, { recursive: true });
  yield* fs.makeDirectory(npmOutputDir, { recursive: true });
  for (const name of [...binaries, content, npm])
    yield* runReleaseCommand("gh", [
      "run",
      "download",
      String(ciRun.databaseId),
      "--repo",
      repository,
      "--name",
      name,
      "--dir",
      name === npm ? npmOutputDir : outputDir,
    ]);
});

NodeRuntime.runMain(
  program.pipe(
    Effect.provide(NodeServices.layer),
    Effect.tapCause((cause) => Console.error(Cause.pretty(cause))),
  ),
  { disableErrorReporting: true },
);

import * as Cause from "effect/Cause";
import * as Console from "effect/Console";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { produceReleaseCohort, validateReleaseCohort } from "./release-packages.js";
import { readReleaseVersion } from "./release-runtime.js";

NodeRuntime.runMain(
  Effect.gen(function* () {
    const [commit, output] = yield* Schema.decodeUnknownEffect(
      Schema.Tuple([Schema.String, Schema.String]),
    )(process.argv.slice(2));
    const version = yield* readReleaseVersion();
    yield* produceReleaseCohort(version, commit, output);
    yield* validateReleaseCohort(output, version, commit);
    yield* Console.log(`Produced verified npm cohort ${version} for ${commit}.`);
  }).pipe(
    Effect.provide(NodeServices.layer),
    Effect.tapCause((cause) => Console.error(Cause.pretty(cause))),
  ),
  { disableErrorReporting: true },
);

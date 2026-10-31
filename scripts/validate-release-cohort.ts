import * as Cause from "effect/Cause";
import * as Console from "effect/Console";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { validateReleaseCohort } from "./release-packages.js";

NodeRuntime.runMain(
  Effect.gen(function* () {
    const [directory, version, commit] = yield* Schema.decodeUnknownEffect(
      Schema.Tuple([Schema.String, Schema.String, Schema.String]),
    )(process.argv.slice(2));
    const path = yield* Path.Path;
    yield* validateReleaseCohort(path.resolve(directory), version, commit);
    yield* Console.log(`Validated exact npm cohort ${version} for ${commit}.`);
  }).pipe(
    Effect.provide(NodeServices.layer),
    Effect.tapCause((cause) => Console.error(Cause.pretty(cause))),
  ),
  { disableErrorReporting: true },
);

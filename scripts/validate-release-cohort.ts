import * as Cause from "effect/Cause";
import * as Console from "effect/Console";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { requireFullSha } from "./release-identity.js";
import { releaseValidation } from "./release-process.js";
import { validateReleaseCohort } from "./release-packages.js";
import { releaseSnapshotLayer } from "./release-runtime.js";

NodeRuntime.runMain(
  Effect.gen(function* () {
    const [directory, version, commit] = yield* Schema.decodeUnknownEffect(
      Schema.Tuple([Schema.String, Schema.String, Schema.String]),
    )(process.argv.slice(2));
    yield* releaseValidation("Validate release commit", () =>
      requireFullSha(commit, "Release commit"),
    );
    const path = yield* Path.Path;
    yield* validateReleaseCohort(path.resolve(directory), version, commit).pipe(
      Effect.provide(releaseSnapshotLayer()),
    );
    yield* Console.log(`Validated exact npm cohort ${version} for ${commit}.`);
  }).pipe(
    Effect.provide(NodeServices.layer),
    Effect.tapCause((cause) => Console.error(Cause.pretty(cause))),
  ),
  { disableErrorReporting: true },
);

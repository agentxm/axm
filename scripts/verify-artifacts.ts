import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FileSystem from "effect/FileSystem";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  describeUndeclaredTypeDependency,
  findUndeclaredTypeDependencies,
  readBuiltDeclarationSubjects,
} from "./declared-type-dependencies.js";
import { packReleaseCohort } from "./release-packages.js";
import { readVersionFromJson } from "./release-identity.js";
import { releaseValidation } from "./release-process.js";
import { ReleaseSnapshot, releaseSnapshotLayer } from "./release-runtime.js";

class ArtifactVerificationFailure extends Data.TaggedError("ArtifactVerificationFailure")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const verification = Effect.gen(function* () {
  const { subjects, unbuilt } = yield* Effect.tryPromise({
    try: () => readBuiltDeclarationSubjects(),
    catch: (cause) =>
      new ArtifactVerificationFailure({ message: "Cannot inspect built declarations.", cause }),
  });
  if (unbuilt.length > 0 || subjects.length === 0) {
    return yield* new ArtifactVerificationFailure({
      message: `Every buildable project must be built before declaration verification. Missing: ${unbuilt.join(", ") || "all declaration subjects"}.`,
    });
  }
  const findings = findUndeclaredTypeDependencies(subjects);
  if (findings.length > 0) {
    return yield* new ArtifactVerificationFailure({
      message: findings.map(describeUndeclaredTypeDependency).join("\n"),
    });
  }

  const snapshot = yield* ReleaseSnapshot;
  const fs = yield* FileSystem.FileSystem;
  const cli = snapshot.packages.find((member) => member.name === "axm.sh");
  if (cli === undefined) {
    return yield* new ArtifactVerificationFailure({
      message: "axm.sh is not a member of the release cohort.",
    });
  }
  const source = yield* snapshot.read(cli.path);
  const version = yield* releaseValidation("Read release version", () =>
    readVersionFromJson(source, cli.path),
  );
  const directory = yield* fs.makeTempDirectory({ prefix: "axm-pack-verification-" });
  // Failed packs are diagnostic artifacts; successful runs remove their output.
  yield* packReleaseCohort(version, directory).pipe(
    Effect.mapError(
      (cause) =>
        new ArtifactVerificationFailure({
          message: `Release pack verification failed; artifacts retained at ${directory}.`,
          cause,
        }),
    ),
  );
  yield* fs.remove(directory, { recursive: true, force: true });
  yield* Effect.log(
    `Verified workspace declaration dependencies and deterministic packed cohort ${version}, publint package contracts, compiled executables and dependency references.`,
  );
});

await Effect.runPromise(
  verification.pipe(
    Effect.provide(releaseSnapshotLayer().pipe(Layer.provideMerge(NodeServices.layer))),
  ),
);

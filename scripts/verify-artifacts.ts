import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import {
  describeUndeclaredTypeDependency,
  findUndeclaredTypeDependencies,
  readBuiltDeclarationSubjects,
} from "./declared-type-dependencies.js";
import { packReleaseCohort } from "./release-packages.js";
import { readPackageVersion } from "./release-identity.js";
import { RELEASE_PACKAGES } from "./release-shared.js";

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

  const cli = RELEASE_PACKAGES.find((member) => member.name === "axm.sh");
  if (cli === undefined) {
    return yield* new ArtifactVerificationFailure({
      message: "axm.sh is not a member of the release cohort.",
    });
  }
  const version = yield* Effect.try({
    try: () => readPackageVersion(cli.path),
    catch: (cause) =>
      new ArtifactVerificationFailure({ message: "Cannot read the release version.", cause }),
  });
  const directory = yield* Effect.try({
    try: () => mkdtempSync(join(tmpdir(), "axm-pack-verification-")),
    catch: (cause) =>
      new ArtifactVerificationFailure({
        message: "Cannot create artifact verification output.",
        cause,
      }),
  });
  // Failed packs are diagnostic artifacts; successful runs remove their output.
  yield* Effect.tryPromise({
    try: () => packReleaseCohort(version, directory),
    catch: (cause) =>
      new ArtifactVerificationFailure({
        message: `Release pack verification failed; artifacts retained at ${directory}.`,
        cause,
      }),
  });
  yield* Effect.try({
    try: () => rmSync(directory, { recursive: true, force: true }),
    catch: (cause) =>
      new ArtifactVerificationFailure({
        message: `Cannot remove verified artifacts at ${directory}.`,
        cause,
      }),
  });
  yield* Effect.log(
    `Verified workspace declaration dependencies and deterministic packed cohort ${version}, publint package contracts, compiled executables and dependency references.`,
  );
});

await Effect.runPromise(verification);

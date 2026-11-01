/** Generate and validate a candidate in the caller-owned isolated checkout. */
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Cause from "effect/Cause";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import {
  releaseChangelog as nxReleaseChangelog,
  releaseVersion as nxReleaseVersion,
} from "nx/release/index.js";
import { releaseTagFromVersion } from "./release-identity.js";
import {
  type ReleaseCandidateHost,
  runReleaseCandidatePreparation,
} from "./release-prepare-candidate-orchestration.js";
import {
  AXM_SKILL_DOCUMENT_PATH,
  AXM_SKILL_MANIFEST_PATH,
  RELEASE_NX_ENV,
  stampSkillCompatibilityContent,
  stampSkillManifestContent,
} from "./release-shared.js";
import {
  releaseValidation,
  ReleaseValidationFailed,
  runReleaseCommand,
} from "./release-process.js";
import { readReleaseVersion, releaseSnapshotLayer } from "./release-runtime.js";

type NxReleaseContext = Awaited<ReturnType<typeof nxReleaseVersion>>;

// Nx's programmatic release APIs have no AbortSignal. Await their completion
// under interruption so the owning checkout cannot be released while Nx mutates it.
const nxRelease = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new ReleaseValidationFailed({ operation, cause }),
  }).pipe(Effect.uninterruptible);

const host = {
  version: Effect.fnUntraced(function* () {
    yield* Console.log("\n==> Candidate phase 1: Version pending release plans");
    const context = yield* nxRelease("Version pending release plans", () =>
      nxReleaseVersion({
        dryRun: false,
        deleteVersionPlans: true,
        stageChanges: false,
        gitCommit: false,
        gitTag: false,
        gitPush: false,
      }),
    );
    const version = yield* releaseValidation("Resolve candidate version", () => {
      if (context.workspaceVersion === undefined || context.workspaceVersion === null)
        throw new Error(
          "Expected Nx Release to resolve a fixed workspace version from pending version plans. Run `pnpm release:plan` first.",
        );
      return context.workspaceVersion;
    });
    return { version, context };
  }),
  changelog: Effect.fnUntraced(function* (candidate: {
    readonly version: string;
    readonly context: NxReleaseContext;
  }) {
    yield* Console.log("\n==> Candidate phase 2: Update changelog");
    yield* nxRelease("Update candidate changelog", () =>
      nxReleaseChangelog({
        version: candidate.version,
        versionData: candidate.context.projectsVersionData,
        releaseGraph: candidate.context.releaseGraph,
        dryRun: false,
        createRelease: false,
        stageChanges: false,
        gitCommit: false,
        gitTag: false,
        gitPush: false,
      }),
    );
  }),
  stampSkill: Effect.fnUntraced(function* (version: string) {
    yield* Console.log("\n==> Candidate phase 3: Stamp the bundled AXM skill");
    const fs = yield* FileSystem.FileSystem;
    const manifest = yield* fs.readFileString(AXM_SKILL_MANIFEST_PATH);
    const document = yield* fs.readFileString(AXM_SKILL_DOCUMENT_PATH);
    const stampedManifest = yield* releaseValidation("Stamp skill manifest", () =>
      stampSkillManifestContent(manifest, version),
    );
    const stampedDocument = yield* releaseValidation("Stamp skill compatibility", () =>
      stampSkillCompatibilityContent(document, version),
    );
    yield* fs.writeFileString(AXM_SKILL_MANIFEST_PATH, stampedManifest);
    yield* fs.writeFileString(AXM_SKILL_DOCUMENT_PATH, stampedDocument);
  }),
  generateSkill: () =>
    runReleaseCommand(
      "pnpm",
      ["exec", "nx", "run", "cli:generate:bundled-axm-skill", "--outputStyle=static"],
      { env: RELEASE_NX_ENV, extendEnv: true },
    ),
  generateCliReference: () =>
    runReleaseCommand(
      "pnpm",
      ["exec", "nx", "run", "cli:generate:cli-reference", "--outputStyle=static"],
      { env: RELEASE_NX_ENV, extendEnv: true },
    ),
  validateCohort: Effect.fnUntraced(function* (version: string) {
    yield* Console.log("\n==> Candidate phase 4: Validate the exact release cohort");
    const appliedVersion = yield* readReleaseVersion;
    yield* releaseValidation("Validate candidate cohort", () => {
      if (appliedVersion !== version)
        throw new Error(
          `Nx Release reported ${version}, but package versions on disk are ${appliedVersion}.`,
        );
    });
  }),
};
type HostEffect = ReturnType<(typeof host)[keyof typeof host]>;
const candidateHost: ReleaseCandidateHost<
  NxReleaseContext,
  Effect.Error<HostEffect>,
  Effect.Services<HostEffect>
> = host;
const program = Effect.gen(function* () {
  const version = yield* runReleaseCandidatePreparation(candidateHost);
  const tag = yield* releaseValidation("Resolve candidate tag", () =>
    releaseTagFromVersion(version),
  );
  yield* Console.log(`  Version: ${version}\n  Tag: ${tag}`);
});
NodeRuntime.runMain(
  program.pipe(
    Effect.provide(releaseSnapshotLayer().pipe(Layer.provideMerge(NodeServices.layer))),
    Effect.tapCause((cause) => Console.error(Cause.pretty(cause))),
  ),
  { disableErrorReporting: true },
);

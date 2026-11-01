/** Invocation-owned release inventory and typed preflight reads. */
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import { RELEASE_COHORT_TAG, resolveReleaseCohort, type ReleasePackage } from "./release-cohort.js";
import { readVersionFromJson } from "./release-identity.js";
import {
  AXM_SKILL_DOCUMENT_PATH,
  AXM_SKILL_GENERATED_PATH,
  AXM_SKILL_MANIFEST_PATH,
  parseCiArtifacts,
  parseGitHubRuns,
  readGeneratedSkillCompatibilityFromContent,
  readSkillCompatibilityFromContent,
  requireMatchingReleaseCompatibility,
  validateCiRunDetails,
  validateExactCiRunDetails,
  type VerifiedGitHubRun,
} from "./release-shared.js";
import {
  captureReleaseCommand,
  makeReleaseCommandCapture,
  releaseValidation,
  ReleaseCommandFailed,
  ReleaseValidationFailed,
} from "./release-process.js";

export const releaseRepository = Config.String("GITHUB_REPOSITORY").pipe(
  Config.withDefault("agentxm/axm"),
  Config.map((repository) => (repository === "" ? "agentxm/axm" : repository)),
);

export class ReleaseSnapshot extends Context.Service<
  ReleaseSnapshot,
  {
    readonly describe: string;
    readonly root: string;
    readonly packages: readonly ReleasePackage[];
    readonly read: (
      file: string,
    ) => Effect.Effect<string, PlatformError.PlatformError | ReleaseCommandFailed>;
  }
>()("axm/scripts/release-runtime/ReleaseSnapshot") {}

/** Membership and descriptors always come from the same selected repository state. */
export const makeReleaseSnapshot = Effect.fnUntraced(function* (ref?: string, root = ".") {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const capture = makeReleaseCommandCapture(yield* ChildProcessSpawner.ChildProcessSpawner);
  const repository = path.resolve(root);
  const describe = ref ?? "working tree";
  const read = (file: string) =>
    ref === undefined
      ? fs.readFileString(path.join(repository, file))
      : capture("git", ["show", `${ref}:${file}`], { cwd: repository });
  const inventory = yield* capture(
    "git",
    ref === undefined ? ["ls-files", "--", "*project.json"] : ["ls-tree", "-r", "--name-only", ref],
    { cwd: repository },
  );
  const projects = inventory
    .split("\n")
    .filter((file) => file === "project.json" || file.endsWith("/project.json"));
  const contents = new Map<string, string>();
  for (const file of projects) {
    const content = yield* read(file);
    contents.set(file, content);
    const declaration = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(Schema.Struct({ tags: Schema.optional(Schema.Array(Schema.String)) })),
    )(content);
    if (declaration.tags?.includes(RELEASE_COHORT_TAG)) {
      const manifest =
        file === "project.json"
          ? "package.json"
          : `${file.slice(0, -"project.json".length)}package.json`;
      contents.set(manifest, yield* read(manifest));
    }
  }
  const packages = yield* releaseValidation("Resolve release cohort", () =>
    resolveReleaseCohort({
      describe,
      listProjectFiles: () => projects,
      read: (file) => {
        const content = contents.get(file);
        if (content === undefined)
          throw new Error(`Missing release snapshot file ${describe}:${file}.`);
        return content;
      },
    }),
  );
  return ReleaseSnapshot.of({ describe, root: repository, packages, read });
});

export const releaseSnapshotLayer = (ref?: string, root = ".") =>
  Layer.effect(ReleaseSnapshot, makeReleaseSnapshot(ref, root));

export const readReleaseVersion = Effect.gen(function* () {
  const snapshot = yield* ReleaseSnapshot;
  const versions = yield* Effect.forEach(
    [...snapshot.packages.map((pkg) => pkg.path), AXM_SKILL_MANIFEST_PATH],
    Effect.fnUntraced(function* (file) {
      const content = yield* snapshot.read(file);
      const version = yield* releaseValidation("Decode release version", () =>
        readVersionFromJson(content, file),
      );
      return [file, version] as const;
    }),
  );
  const document = yield* snapshot.read(AXM_SKILL_DOCUMENT_PATH);
  const generated = yield* snapshot.read(AXM_SKILL_GENERATED_PATH);
  return yield* releaseValidation("Validate release compatibility", () =>
    requireMatchingReleaseCompatibility(
      versions,
      readSkillCompatibilityFromContent(document, AXM_SKILL_DOCUMENT_PATH),
      readGeneratedSkillCompatibilityFromContent(generated, AXM_SKILL_GENERATED_PATH),
      snapshot.describe,
    ),
  );
});

export const successfulReleaseCiRun = Effect.fnUntraced(function* (
  repository: string,
  sha: string,
) {
  const listing = yield* captureReleaseCommand("gh", [
    "run",
    "list",
    "--repo",
    repository,
    "--workflow",
    "ci.yml",
    "--commit",
    sha,
    "--limit",
    "20",
    "--json",
    "databaseId,event,headSha,number,status,conclusion,url,workflowName",
  ]);
  const runs = yield* releaseValidation("Decode release CI runs", () => parseGitHubRuns(listing));
  const selected = runs.find(
    (run) => run.headSha === sha && run.status === "completed" && run.conclusion === "success",
  );
  if (selected === undefined) {
    const latest = runs[0];
    const message =
      latest === undefined
        ? `No CI workflow run found for commit ${sha}. Push the release commit to origin/main first.`
        : latest.status !== "completed" || latest.conclusion === null
          ? `CI workflow for commit ${sha} has not completed successfully yet. Wait for it to finish: ${latest.url}`
          : `CI workflow for commit ${sha} concluded with ${latest.conclusion}: ${latest.url}`;
    return yield* new ReleaseValidationFailed({
      operation: "Verify CI producer",
      cause: message,
    });
  }
  const response = yield* captureReleaseCommand("gh", [
    "api",
    `repos/${repository}/actions/runs/${selected.databaseId}`,
  ]);
  const details = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(
    response,
  );
  return yield* releaseValidation("Validate CI provenance", () =>
    validateCiRunDetails(details, selected),
  );
});

export const successfulReleaseCiRunById = Effect.fnUntraced(function* (
  repository: string,
  databaseId: number,
  sha: string,
  event: "push" | "workflow_dispatch",
) {
  yield* releaseValidation("Validate CI run identity", () => {
    if (!Number.isSafeInteger(databaseId) || databaseId < 1)
      throw new Error("Expected a positive exact CI run ID.");
  });
  const response = yield* captureReleaseCommand("gh", [
    "api",
    `repos/${repository}/actions/runs/${databaseId}`,
  ]);
  const details = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(
    response,
  );
  return yield* releaseValidation("Validate exact CI provenance", () =>
    validateExactCiRunDetails(details, { databaseId, headSha: sha, event }),
  );
});

export const releaseCiArtifacts = Effect.fnUntraced(function* (
  repository: string,
  run: VerifiedGitHubRun,
  expectedNames: readonly string[],
) {
  const response = yield* captureReleaseCommand("gh", [
    "api",
    "--paginate",
    "--slurp",
    `repos/${repository}/actions/runs/${run.databaseId}/artifacts?per_page=100`,
  ]);
  const decoded = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(
    response,
  );
  return yield* releaseValidation("Validate CI artifacts", () => {
    const artifacts = parseCiArtifacts(decoded, run);
    for (const expected of expectedNames) {
      const matches = artifacts.filter((artifact) => artifact.name === expected);
      if (matches.length !== 1)
        throw new Error(
          `Expected exactly one ${expected} artifact from CI run ${run.databaseId} attempt ${run.attempt}; found ${matches.length}.`,
        );
    }
    return artifacts;
  });
});

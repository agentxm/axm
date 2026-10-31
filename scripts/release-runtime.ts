/** Installed release preflight reads, sharing the dependency-free contract validators. */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import { RELEASE_COHORT_TAG, resolveReleaseCohort } from "./release-cohort.js";
import { readVersionFromJson } from "./release-identity.js";
import {
  AXM_SKILL_DOCUMENT_PATH,
  AXM_SKILL_GENERATED_PATH,
  AXM_SKILL_MANIFEST_PATH,
  RELEASE_PACKAGES,
  RELEASE_REPO,
  parseGitHubRuns,
  readGeneratedSkillCompatibilityFromContent,
  readSkillCompatibilityFromContent,
  requireMatchingReleaseCompatibility,
  validateCiRunDetails,
} from "./release-shared.js";
import {
  captureReleaseCommand,
  releaseValidation,
  ReleaseValidationFailed,
} from "./release-process.js";

export const readReleaseVersion = (ref?: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const read = (file: string) =>
      ref === undefined
        ? fs.readFileString(file)
        : captureReleaseCommand("git", ["show", `${ref}:${file}`]);
    const packages =
      ref === undefined
        ? RELEASE_PACKAGES
        : yield* Effect.gen(function* () {
            const inventory = yield* captureReleaseCommand("git", [
              "ls-tree",
              "-r",
              "--name-only",
              ref,
            ]);
            const projects = inventory
              .split("\n")
              .filter((file) => file === "project.json" || file.endsWith("/project.json"));
            const contents = new Map<string, string>();
            for (const file of projects) {
              const content = yield* read(file);
              contents.set(file, content);
              const declaration = yield* Schema.decodeUnknownEffect(
                Schema.fromJsonString(
                  Schema.Struct({ tags: Schema.optional(Schema.Array(Schema.String)) }),
                ),
              )(content);
              if (declaration.tags?.includes(RELEASE_COHORT_TAG)) {
                const manifest =
                  file === "project.json"
                    ? "package.json"
                    : `${file.slice(0, -"project.json".length)}package.json`;
                contents.set(manifest, yield* read(manifest));
              }
            }
            return yield* releaseValidation("Resolve release cohort", () =>
              resolveReleaseCohort({
                describe: ref,
                listProjectFiles: () => projects,
                read: (file) => {
                  const content = contents.get(file);
                  if (content === undefined)
                    throw new Error(`Missing release snapshot file ${ref}:${file}.`);
                  return content;
                },
              }),
            );
          });
    const versions = yield* Effect.forEach(
      [...packages.map((pkg) => pkg.path), AXM_SKILL_MANIFEST_PATH],
      (file) =>
        Effect.gen(function* () {
          const content = yield* read(file);
          const version = yield* releaseValidation("Decode release version", () =>
            readVersionFromJson(content, file),
          );
          return [file, version] as const;
        }),
    );
    const document = yield* read(AXM_SKILL_DOCUMENT_PATH);
    const generated = yield* read(AXM_SKILL_GENERATED_PATH);
    return yield* releaseValidation("Validate release compatibility", () =>
      requireMatchingReleaseCompatibility(
        versions,
        readSkillCompatibilityFromContent(document, AXM_SKILL_DOCUMENT_PATH),
        readGeneratedSkillCompatibilityFromContent(generated, AXM_SKILL_GENERATED_PATH),
        ref ?? "working tree",
      ),
    );
  });

export const successfulReleaseCiRun = (sha: string) =>
  Effect.gen(function* () {
    const listing = yield* captureReleaseCommand("gh", [
      "run",
      "list",
      "--repo",
      RELEASE_REPO,
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
      `repos/${RELEASE_REPO}/actions/runs/${selected.databaseId}`,
    ]);
    const details = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(
      response,
    );
    return yield* releaseValidation("Validate CI provenance", () =>
      validateCiRunDetails(details, selected),
    );
  });

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import {
  GitOperationFailed,
  type GitDirectoryComparisonService,
} from "@agentxm/workspace-kernel/sources";

import {
  makePublishWorld,
  publishDocument,
  requestFor,
  runPublish,
  type PublishWorld,
} from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/publish/reports-git-reason-when-source-assessment-fails",
  title: "Publish reports the Git reason when source state cannot be assessed",
  statement:
    "When publish cannot assess an extension's source state against Git, whether while planning or when revalidating before upload, it shall fail the operation, upload nothing for that extension, and report the extension together with the available Git reason with credentials redacted, rather than treating the extension as outside Git, without HEAD, or matching HEAD.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "machine-automation"],
  methods: ["example"],
  derivedFrom: ["cli/publish/requires-explicit-acceptance-for-non-head-source"],
  supersedes: [],
  assumptions: [
    "The Git comparison reports its failure as a typed Git operation failure whose detail names the operation and Git's reason; every scenario substitutes that failure rather than running Git.",
  ],
  openQuestions: [],
});

const revision = "0123456789abcdef0123456789abcdef01234567";

const reportedReason =
  "Could not assess the published source state for @acme/skills/review. Failed to compare 'skills/review' with Git HEAD: fatal: unable to read 'https://robot:[REDACTED]@example.test/repo.git': bad object HEAD";

const gitFailure = new GitOperationFailed({
  operation: "compare-directory-to-head",
  detail:
    "Failed to compare 'skills/review' with Git HEAD: fatal: unable to read 'https://robot:s3cret-sentinel@example.test/repo.git': bad object HEAD",
});

const failingComparison: GitDirectoryComparisonService["compare"] = () => Effect.fail(gitFailure);

/** Match HEAD while planning, then fail when publish revalidates before upload. */
const failingOnRevalidation = (): GitDirectoryComparisonService["compare"] => {
  let calls = 0;
  return () => {
    calls += 1;
    return calls === 1
      ? Effect.succeed(
          Option.some({
            repositoryRoot: "/repo",
            repositoryDirectory: "skills/review",
            headRevision: revision,
            differences: [],
          }),
        )
      : Effect.fail(gitFailure);
  };
};

describe("Publishing when Git cannot assess the source state", () => {
  const worlds: Array<PublishWorld> = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.cleanup();
  });

  const setup = (compare: GitDirectoryComparisonService["compare"]) => {
    const world = makePublishWorld({
      settings: { skills: { review: "workspace" } },
      compare,
    });
    worlds.push(world);
    world.write("skill", { name: "review" });
    return world;
  };

  it.effect("names the extension and Git's reason while planning, uploads nothing", () =>
    Effect.gen(function* () {
      const world = setup(failingComparison);

      const outcome = yield* world.provide(
        runPublish(
          requestFor(world, {
            selectors: ["@acme/skills/review"],
            preview: false,
            acceptWarnings: true,
          }),
        ),
      );

      expect(outcome.disposition._tag).toBe("Failed");
      expect(world.target.storedFiles()).toEqual([]);
      const document = publishDocument(outcome);
      expect(document).toMatchObject({
        execution: {
          status: "failed",
          outcomes: [
            {
              id: "@acme/skills/review",
              status: "failed",
              message: reportedReason,
              cause: { message: reportedReason },
            },
          ],
        },
      });
      expect(document.execution.outcomes[0]).not.toHaveProperty("sourceState");
      expect(JSON.stringify(document)).not.toContain("s3cret-sentinel");
    }),
  );

  it.effect("names the extension and Git's reason when revalidation fails, uploads nothing", () =>
    Effect.gen(function* () {
      const world = setup(failingOnRevalidation());

      const outcome = yield* world.provide(
        runPublish(requestFor(world, { selectors: ["@acme/skills/review"], preview: false })),
      );

      expect(outcome.disposition._tag).toBe("Failed");
      expect(world.target.storedFiles()).toEqual([]);
      const document = publishDocument(outcome);
      expect(document).toMatchObject({
        execution: {
          status: "failed",
          outcomes: [{ id: "@acme/skills/review", status: "pending" }],
          failure: { code: "internal", message: reportedReason },
        },
      });
      expect(JSON.stringify(document)).not.toContain("s3cret-sentinel");
    }),
  );
});

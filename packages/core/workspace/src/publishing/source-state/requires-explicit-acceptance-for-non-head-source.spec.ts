import * as fs from "node:fs";
import * as nodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import type {
  GitDirectoryComparisonService,
  GitDirectoryDifference,
} from "@agentxm/extension-sources";

import {
  makePublishWorld,
  publishDocument,
  requestFor,
  runPublish,
  type PublishWorld,
} from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/publish/requires-explicit-acceptance-for-non-head-source",
  title: "Publish requires explicit acceptance when archive content differs from Git HEAD",
  statement:
    "When an extension's archive differs from Git HEAD or the repository has no HEAD, publish shall block that extension and name --accept-warnings as the required override until it is given, while an archive matching HEAD, outside Git, or differing only in excluded paths shall publish without acceptance; and each outcome shall report the comparison basis, its status, the HEAD revision when one exists, and the material differences and their count, while an outcome for an extension outside Git shall carry no source-state report.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "workspace-intent-fidelity", "machine-automation"],
  methods: ["decision-table", "example", "contract"],
  derivedFrom: ["cli/publish/outcomes-report-source-state"],
  supersedes: ["cli/publish/outcomes-report-source-state"],
  assumptions: [
    "The Git comparison AXM performs reports added, deleted, and modified paths accurately relative to HEAD; every scenario substitutes the comparison outcome rather than running Git.",
  ],
  openQuestions: [],
});

const revision = "0123456789abcdef0123456789abcdef01234567";

const gitComparison =
  (
    differences: ReadonlyArray<GitDirectoryDifference>,
    options: { readonly head?: string } = { head: revision },
  ): GitDirectoryComparisonService["compare"] =>
  ({ directory }) =>
    Effect.succeed(
      Option.some({
        repositoryRoot: nodePath.dirname(nodePath.dirname(directory)),
        repositoryDirectory: `skills/${nodePath.basename(directory)}`,
        ...(options.head === undefined ? {} : { headRevision: options.head }),
        differences,
      }),
    );

/** The risk condition that names --accept-warnings as the required override. */
const overrideRequiredCondition = expect.objectContaining({
  level: "override-required",
  policy: "accept-warnings",
  requiredFlag: "--accept-warnings",
});

const modifiedContent: ReadonlyArray<GitDirectoryDifference> = [
  { path: "src/SKILL.md", change: "modified" },
];

describe("Publishing archive content not represented by Git HEAD", () => {
  const worlds: Array<PublishWorld> = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.cleanup();
  });

  const setup = (
    compare?: GitDirectoryComparisonService["compare"],
    publishIgnore?: ReadonlyArray<string>,
  ) => {
    const world = makePublishWorld({
      settings: { skills: { review: "workspace" } },
      ...(compare === undefined ? {} : { compare }),
    });
    worlds.push(world);
    world.write("skill", {
      name: "review",
      ...(publishIgnore === undefined ? {} : { publishIgnore }),
    });
    return world;
  };

  it.effect(
    "names the required override in preview, reports the differences, uploads nothing",
    () =>
      Effect.gen(function* () {
        const differences: ReadonlyArray<GitDirectoryDifference> = [
          { path: "notes.md", change: "added" },
          { path: "old.md", change: "deleted" },
          { path: "src/SKILL.md", change: "modified" },
        ];
        const world = setup(gitComparison(differences));

        const outcome = yield* world.provide(
          runPublish(requestFor(world, { selectors: ["@acme/skills/review"] })),
        );

        const document = publishDocument(outcome);
        expect(document).toMatchObject({
          mode: "preview",
          execution: { status: "not-run", riskConditions: [overrideRequiredCondition] },
        });
        expect(document.execution.outcomes).toHaveLength(1);
        expect(document.execution.outcomes[0]?.sourceState).toMatchObject({
          basis: "git-head",
          status: "differs-from-head",
          revision,
          differences,
          differenceCount: 3,
        });
        expect(world.target.storedFiles()).toEqual([]);
      }),
  );

  it.effect("blocks apply without explicit warning acceptance", () =>
    Effect.gen(function* () {
      const world = setup(gitComparison(modifiedContent));

      const outcome = yield* world.provide(
        runPublish(requestFor(world, { selectors: ["@acme/skills/review"], preview: false })),
      );

      expect(outcome.disposition._tag).toBe("Failed");
      expect(world.target.storedFiles()).toEqual([]);
      expect(publishDocument(outcome)).toMatchObject({
        execution: {
          status: "failed",
          outcomes: [{ status: "blocked", reason: "source_state_not_accepted" }],
        },
      });
    }),
  );

  it.effect("publishes the differing archive after --accept-warnings", () =>
    Effect.gen(function* () {
      const world = setup(gitComparison(modifiedContent));

      const outcome = yield* world.provide(
        runPublish(
          requestFor(world, {
            selectors: ["@acme/skills/review"],
            preview: false,
            acceptWarnings: true,
          }),
        ),
      );

      expect(world.target.storedFiles()).not.toEqual([]);
      const document = publishDocument(outcome);
      expect(document).toMatchObject({
        execution: { status: "completed", outcomes: [{ status: "success" }] },
      });
      expect(document.execution.outcomes[0]?.sourceState).toMatchObject({
        basis: "git-head",
        status: "differs-from-head",
        revision,
        differences: modifiedContent,
        differenceCount: 1,
      });
    }),
  );

  it.effect("treats a Git worktree without HEAD as requiring explicit acceptance", () =>
    Effect.gen(function* () {
      const world = setup(gitComparison([{ path: "skill.json", change: "added" }], {}));

      const outcome = yield* world.provide(
        runPublish(requestFor(world, { selectors: ["@acme/skills/review"] })),
      );

      const document = publishDocument(outcome);
      expect(document).toMatchObject({
        execution: { riskConditions: [overrideRequiredCondition] },
      });
      expect(document.execution.outcomes[0]?.sourceState).toMatchObject({
        basis: "git-head",
        status: "no-head",
      });
      expect(document.execution.outcomes[0]?.sourceState).not.toHaveProperty("revision");
      expect(world.target.storedFiles()).toEqual([]);
    }),
  );

  it.effect("publishes an archive represented by HEAD without acceptance", () =>
    Effect.gen(function* () {
      const world = setup(gitComparison([]));

      const outcome = yield* world.provide(
        runPublish(requestFor(world, { selectors: ["@acme/skills/review"], preview: false })),
      );

      expect(world.target.storedFiles()).not.toEqual([]);
      const document = publishDocument(outcome);
      expect(document).toMatchObject({
        execution: { status: "completed", outcomes: [{ status: "success" }] },
      });
      expect(document.execution.outcomes[0]?.sourceState).toMatchObject({
        basis: "git-head",
        status: "matches-head",
        revision,
        differences: [],
        differenceCount: 0,
      });
    }),
  );

  it.effect("publishes outside Git without acceptance and reports no source state", () =>
    Effect.gen(function* () {
      const world = setup();

      const outcome = yield* world.provide(
        runPublish(requestFor(world, { selectors: ["@acme/skills/review"], preview: false })),
      );

      expect(world.target.storedFiles()).not.toEqual([]);
      const document = publishDocument(outcome);
      expect(document).toMatchObject({
        execution: { status: "completed", outcomes: [{ status: "success" }] },
      });
      expect(document.execution.outcomes[0]).not.toHaveProperty("sourceState");
    }),
  );

  it.effect("does not require acceptance when every difference is excluded from the archive", () =>
    Effect.gen(function* () {
      const world = setup(gitComparison([{ path: "evals/case.json", change: "modified" }]), [
        "evals/*",
      ]);
      fs.mkdirSync(nodePath.join(world.root, "skills", "review", "evals"), { recursive: true });
      fs.writeFileSync(nodePath.join(world.root, "skills", "review", "evals", "case.json"), "{}\n");

      const outcome = yield* world.provide(
        runPublish(requestFor(world, { selectors: ["@acme/skills/review"], preview: false })),
      );

      expect(world.target.storedFiles()).not.toEqual([]);
      const document = publishDocument(outcome);
      expect(document).toMatchObject({
        execution: { status: "completed", outcomes: [{ status: "success" }] },
      });
      expect(document.execution.outcomes[0]?.sourceState).toMatchObject({
        status: "matches-head",
        differences: [],
        differenceCount: 0,
      });
    }),
  );
});

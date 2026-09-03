import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import { afterEach } from "vitest";

import {
  handleRootPublish,
  type GitDirectoryComparisonService,
  type GitDirectoryDifference,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../support/install-harness.js";
import {
  makeFileRegistry,
  makePublishLayer,
  publishArgs,
  writeAuthoredSkill,
} from "../../support/publish-harness.js";

export const specification = defineSpecification({
  requirement: "cli/publish/requires-explicit-acceptance-for-non-head-source",
  title: "Publish requires explicit acceptance when archive content differs from Git HEAD",
  statement:
    "When an extension's archive differs from Git HEAD or the repository has no HEAD, publish shall report the difference and block the whole selection until --accept-warnings is given, while archives matching HEAD, outside Git, or differing only in excluded paths shall publish without acceptance.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "workspace-intent-fidelity"],
  status: "accepted",
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
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
        repositoryRoot: path.dirname(path.dirname(directory)),
        repositoryDirectory: `skills/${path.basename(directory)}`,
        ...(options.head === undefined ? {} : { headRevision: options.head }),
        differences,
      }),
    );

const readPublishDocument = (workspace: ReturnType<typeof makeSpecWorkspace>): unknown =>
  workspace.rendererState.results.at(-1)?.data;

describe("Publishing archive content not represented by Git HEAD", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const setup = (publishIgnore?: ReadonlyArray<string>) => {
    const workspace = makeSpecWorkspace({
      machine: true,
      flags: { json: true },
      settings: { skills: { review: "workspace" } },
    });
    cleanups.push(workspace.cleanup);
    writeAuthoredSkill(workspace.root, {
      name: "review",
      ...(publishIgnore === undefined ? {} : { publishIgnore }),
    });
    return { workspace, registry: makeFileRegistry(workspace.root) };
  };

  it.effect("reports a clean filtered archive as represented by HEAD", () =>
    Effect.gen(function* () {
      const { workspace, registry } = setup();

      yield* handleRootPublish(
        publishArgs(registry.url, { selectors: ["@acme/skills/review"] }),
      ).pipe(Effect.provide(makePublishLayer(workspace, gitComparison([]))));

      expect(readPublishDocument(workspace)).toMatchObject({
        mode: "preview",
        execution: {
          outcomes: [
            {
              sourceState: {
                basis: "git-head",
                status: "matches-head",
                revision,
                differences: [],
                differenceCount: 0,
              },
            },
          ],
        },
      });
    }),
  );

  it.effect("publishes outside Git without inventing source-state evidence", () =>
    Effect.gen(function* () {
      const { workspace, registry } = setup();

      yield* handleRootPublish(
        publishArgs(registry.url, {
          selectors: ["@acme/skills/review"],
          preview: false,
        }),
      ).pipe(Effect.provide(makePublishLayer(workspace)));

      expect(registry.storedFiles()).not.toEqual([]);
      expect(readPublishDocument(workspace)).toMatchObject({
        execution: { status: "completed", outcomes: [{ status: "success" }] },
      });
      expect(JSON.stringify(readPublishDocument(workspace))).not.toContain("sourceState");
    }),
  );

  it.effect("reports material paths and requires the named override in preview", () =>
    Effect.gen(function* () {
      const { workspace, registry } = setup();
      const differences: ReadonlyArray<GitDirectoryDifference> = [
        { path: "notes.md", change: "added" },
        { path: "old.md", change: "deleted" },
        { path: "src/SKILL.md", change: "modified" },
      ];

      yield* handleRootPublish(
        publishArgs(registry.url, { selectors: ["@acme/skills/review"] }),
      ).pipe(Effect.provide(makePublishLayer(workspace, gitComparison(differences))));

      expect(readPublishDocument(workspace)).toMatchObject({
        mode: "preview",
        execution: {
          status: "not-run",
          riskConditions: [
            {
              level: "override-required",
              policy: "accept-warnings",
              requiredFlag: "--accept-warnings",
            },
          ],
          outcomes: [
            {
              sourceState: {
                status: "differs-from-head",
                differences,
                differenceCount: 3,
              },
            },
          ],
        },
      });
      expect(registry.storedFiles()).toEqual([]);
    }),
  );

  it.effect.each([
    { label: "without confirmation", yes: false },
    { label: "with --yes", yes: true },
  ])("blocks apply without explicit warning acceptance: $label", (testCase) =>
    Effect.gen(function* () {
      const { workspace, registry } = setup();
      const exit = yield* handleRootPublish(
        publishArgs(registry.url, {
          selectors: ["@acme/skills/review"],
          preview: false,
          yes: testCase.yes,
        }),
      ).pipe(
        Effect.provide(
          makePublishLayer(
            workspace,
            gitComparison([{ path: "src/SKILL.md", change: "modified" }]),
          ),
        ),
        Effect.exit,
      );

      expect(Exit.isFailure(exit)).toBe(true);
      expect(registry.storedFiles()).toEqual([]);
      expect(readPublishDocument(workspace)).toMatchObject({
        execution: {
          status: "failed",
          outcomes: [
            {
              status: "blocked",
              reason: "source_state_not_accepted",
            },
          ],
        },
      });
    }),
  );

  it.effect("blocks the complete selection when one archive needs acceptance", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: { skills: { clean: "workspace", review: "workspace" } },
      });
      cleanups.push(workspace.cleanup);
      writeAuthoredSkill(workspace.root, { name: "clean" });
      writeAuthoredSkill(workspace.root, { name: "review" });
      const registry = makeFileRegistry(workspace.root);
      const compare: GitDirectoryComparisonService["compare"] = (input) =>
        gitComparison(
          path.basename(input.directory) === "review"
            ? [{ path: "src/SKILL.md", change: "modified" }]
            : [],
        )(input);

      const exit = yield* handleRootPublish(publishArgs(registry.url, { preview: false })).pipe(
        Effect.provide(makePublishLayer(workspace, compare)),
        Effect.exit,
      );

      expect(Exit.isFailure(exit)).toBe(true);
      expect(registry.storedFiles()).toEqual([]);
      expect(readPublishDocument(workspace)).toMatchObject({
        execution: {
          outcomes: expect.arrayContaining([
            expect.objectContaining({
              id: "@acme/skills/review",
              status: "blocked",
              reason: "source_state_not_accepted",
            }),
            expect.objectContaining({
              id: "@acme/skills/clean",
              status: "blocked",
              reason: "blocked_by_preflight",
              blockedBy: ["@acme/skills/review"],
            }),
          ]),
        },
      });
    }),
  );

  it.effect("publishes the fixed archive after --accept-warnings", () =>
    Effect.gen(function* () {
      const { workspace, registry } = setup();

      yield* handleRootPublish(
        publishArgs(registry.url, {
          selectors: ["@acme/skills/review"],
          preview: false,
          acceptWarnings: true,
        }),
      ).pipe(
        Effect.provide(
          makePublishLayer(
            workspace,
            gitComparison([{ path: "src/SKILL.md", change: "modified" }]),
          ),
        ),
      );

      expect(registry.storedFiles()).not.toEqual([]);
      expect(readPublishDocument(workspace)).toMatchObject({
        execution: { status: "completed", outcomes: [{ status: "success" }] },
      });
    }),
  );

  it.effect("does not require acceptance when every difference is excluded from the archive", () =>
    Effect.gen(function* () {
      const { workspace, registry } = setup(["evals/*"]);
      fs.mkdirSync(path.join(workspace.root, "skills", "review", "evals"), { recursive: true });
      fs.writeFileSync(path.join(workspace.root, "skills", "review", "evals", "case.json"), "{}\n");

      yield* handleRootPublish(
        publishArgs(registry.url, {
          selectors: ["@acme/skills/review"],
          preview: false,
        }),
      ).pipe(
        Effect.provide(
          makePublishLayer(
            workspace,
            gitComparison([{ path: "evals/case.json", change: "modified" }]),
          ),
        ),
      );

      expect(registry.storedFiles()).not.toEqual([]);
      expect(readPublishDocument(workspace)).toMatchObject({
        execution: {
          status: "completed",
          outcomes: [{ status: "success", sourceState: { status: "matches-head" } }],
        },
      });
    }),
  );

  it.effect("does not compare an existing version verified as an exact archive match", () =>
    Effect.gen(function* () {
      const { workspace, registry } = setup();
      yield* handleRootPublish(
        publishArgs(registry.url, {
          selectors: ["@acme/skills/review"],
          preview: false,
        }),
      ).pipe(Effect.provide(makePublishLayer(workspace)));

      let comparisonCount = 0;
      const compare: GitDirectoryComparisonService["compare"] = () =>
        Effect.sync(() => {
          comparisonCount += 1;
          return Option.none();
        });
      yield* handleRootPublish(
        publishArgs(registry.url, {
          selectors: ["@acme/skills/review"],
          onExisting: Option.some("verify"),
        }),
      ).pipe(Effect.provide(makePublishLayer(workspace, compare)));

      expect(comparisonCount).toBe(0);
      expect(readPublishDocument(workspace)).toMatchObject({
        execution: {
          outcomes: [
            {
              action: "skip",
              reason: "version_already_published",
              status: "success",
            },
          ],
        },
      });
    }),
  );

  it.effect("treats a Git worktree without HEAD as requiring explicit acceptance", () =>
    Effect.gen(function* () {
      const { workspace, registry } = setup();

      yield* handleRootPublish(
        publishArgs(registry.url, { selectors: ["@acme/skills/review"] }),
      ).pipe(
        Effect.provide(
          makePublishLayer(workspace, gitComparison([{ path: "skill.json", change: "added" }], {})),
        ),
      );

      expect(readPublishDocument(workspace)).toMatchObject({
        execution: {
          riskConditions: [{ requiredFlag: "--accept-warnings" }],
          outcomes: [{ sourceState: { status: "no-head" } }],
        },
      });
    }),
  );

  it.effect("rejects apply when source evidence changes after planning", () =>
    Effect.gen(function* () {
      const { workspace, registry } = setup();
      let comparisonCount = 0;
      const compare: GitDirectoryComparisonService["compare"] = (input) => {
        comparisonCount += 1;
        return gitComparison(
          comparisonCount === 1
            ? [{ path: "src/SKILL.md", change: "modified" }]
            : [
                { path: "notes.md", change: "added" },
                { path: "src/SKILL.md", change: "modified" },
              ],
        )(input);
      };

      const exit = yield* handleRootPublish(
        publishArgs(registry.url, {
          selectors: ["@acme/skills/review"],
          preview: false,
          acceptWarnings: true,
        }),
      ).pipe(Effect.provide(makePublishLayer(workspace, compare)), Effect.exit);

      expect(Exit.isFailure(exit)).toBe(true);
      expect(comparisonCount).toBe(2);
      expect(registry.storedFiles()).toEqual([]);
      expect(readPublishDocument(workspace)).toMatchObject({
        execution: {
          failure: { code: "conflict", message: expect.stringContaining("changed after planning") },
          outcomes: [{ status: "blocked", reason: "stale_material" }],
        },
      });
    }),
  );
});

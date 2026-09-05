import { makePublicationSpecContext } from "../../support/publication-evidence-harness.js";
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
  requirement: "cli/publish/preflight-blocks-the-whole-selection",
  title: "One failed publish preflight blocks the whole selection",
  statement:
    "When any selected extension fails publish preflight, publish shall upload nothing for the selection and shall report every other publishable extension as blocked by preflight, naming the extension that failed.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution"],
  methods: ["example"],
  derivedFrom: ["cli/publish/requires-explicit-acceptance-for-non-head-source"],
  supersedes: [],
  assumptions: [
    "The Git comparison AXM performs reports added, deleted, and modified paths accurately relative to HEAD; the source-state scenario substitutes the comparison outcome rather than running Git.",
  ],
  openQuestions: [],
});

const revision = "0123456789abcdef0123456789abcdef01234567";

const gitComparison =
  (differences: ReadonlyArray<GitDirectoryDifference>): GitDirectoryComparisonService["compare"] =>
  ({ directory }) =>
    Effect.succeed(
      Option.some({
        repositoryRoot: path.dirname(path.dirname(directory)),
        repositoryDirectory: `skills/${path.basename(directory)}`,
        headRevision: revision,
        differences,
      }),
    );

const readPublishDocument = (workspace: ReturnType<typeof makeSpecWorkspace>): unknown =>
  workspace.rendererState.results.at(-1)?.data;

describe("Publish preflight over a selection", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const twoSkillWorkspace = (options?: { readonly reviewWithoutSkillMd?: boolean }) => {
    const workspace = makeSpecWorkspace({
      machine: true,
      flags: { json: true },
      settings: { skills: { clean: "workspace", review: "workspace" } },
    });
    cleanups.push(workspace.cleanup);
    writeAuthoredSkill(workspace.root, { name: "clean" });
    writeAuthoredSkill(workspace.root, {
      name: "review",
      withSkillMd: options?.reviewWithoutSkillMd !== true,
    });
    return { workspace, registry: makeFileRegistry(workspace.root) };
  };

  it.effect("blocks the complete selection when one archive needs source-state acceptance", () =>
    Effect.gen(function* () {
      const { workspace, registry } = twoSkillWorkspace();
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

  it.effect("blocks the complete selection when one extension fails the fixed gate", () =>
    Effect.gen(function* () {
      const { workspace, registry } = twoSkillWorkspace({ reviewWithoutSkillMd: true });

      const exit = yield* handleRootPublish(publishArgs(registry.url, { preview: false })).pipe(
        Effect.provide(makePublishLayer(workspace)),
        Effect.exit,
      );

      expect(Exit.isFailure(exit)).toBe(true);
      expect(registry.storedFiles()).toEqual([]);
      expect(readPublishDocument(workspace)).toMatchObject({
        execution: {
          outcomes: expect.arrayContaining([
            expect.objectContaining({ id: "@acme/skills/review", status: "failed" }),
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
  it.effect(
    "blocks an unpublished candidate when another selected immutable version conflicts",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const context = yield* makePublicationSpecContext({
            settings: { skills: { review: "workspace", deploy: "workspace" } },
          });
          writeAuthoredSkill(context.workspace.root, { name: "review" });
          writeAuthoredSkill(context.workspace.root, { name: "deploy" });
          yield* context.run({ selectors: ["@acme/skills/review"] });
          const before = context.snapshotRegistry();
          const exit = yield* context.run({ onExisting: Option.some("error") }).pipe(Effect.exit);
          expect(exit._tag).toBe("Failure");
          expect(context.snapshotRegistry()).toEqual(before);
          const result = yield* context.result();
          expect(result.execution.outcomes).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: "@acme/skills/review",
                status: "failed",
                reason: "version_exists",
              }),
              expect.objectContaining({
                id: "@acme/skills/deploy",
                status: "blocked",
                reason: "blocked_by_preflight",
                blockedBy: ["@acme/skills/review"],
              }),
            ]),
          );
          yield* context.run({ selectors: ["@acme/skills/deploy"] });
          expect(context.archive("deploy").length).toBeGreaterThan(0);
        }),
      ),
  );
});

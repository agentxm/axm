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
    "When an extension's archive differs from Git HEAD or the repository has no HEAD, publish shall block that extension and name --accept-warnings as the required override until it is given, while an archive matching HEAD, outside Git, or differing only in excluded paths shall publish without acceptance.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "workspace-intent-fidelity"],
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

/** The risk condition that names --accept-warnings as the required override. */
const overrideRequiredCondition = expect.objectContaining({
  level: "override-required",
  requiredFlag: "--accept-warnings",
});

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

  it.effect("names the required override in preview and uploads nothing", () =>
    Effect.gen(function* () {
      const { workspace, registry } = setup();

      yield* handleRootPublish(
        publishArgs(registry.url, { selectors: ["@acme/skills/review"] }),
      ).pipe(
        Effect.provide(
          makePublishLayer(
            workspace,
            gitComparison([{ path: "src/SKILL.md", change: "modified" }]),
          ),
        ),
      );

      expect(readPublishDocument(workspace)).toMatchObject({
        mode: "preview",
        execution: { status: "not-run", riskConditions: [overrideRequiredCondition] },
      });
      expect(registry.storedFiles()).toEqual([]);
    }),
  );

  it.effect("blocks apply without explicit warning acceptance", () =>
    Effect.gen(function* () {
      const { workspace, registry } = setup();
      const exit = yield* handleRootPublish(
        publishArgs(registry.url, {
          selectors: ["@acme/skills/review"],
          preview: false,
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
          outcomes: [{ status: "blocked", reason: "source_state_not_accepted" }],
        },
      });
    }),
  );

  it.effect("publishes the differing archive after --accept-warnings", () =>
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
        execution: { riskConditions: [overrideRequiredCondition] },
      });
      expect(registry.storedFiles()).toEqual([]);
    }),
  );

  it.effect("publishes an archive represented by HEAD without acceptance", () =>
    Effect.gen(function* () {
      const { workspace, registry } = setup();

      yield* handleRootPublish(
        publishArgs(registry.url, { selectors: ["@acme/skills/review"], preview: false }),
      ).pipe(Effect.provide(makePublishLayer(workspace, gitComparison([]))));

      expect(registry.storedFiles()).not.toEqual([]);
      expect(readPublishDocument(workspace)).toMatchObject({
        execution: { status: "completed", outcomes: [{ status: "success" }] },
      });
    }),
  );

  it.effect("publishes outside Git without acceptance", () =>
    Effect.gen(function* () {
      const { workspace, registry } = setup();

      yield* handleRootPublish(
        publishArgs(registry.url, { selectors: ["@acme/skills/review"], preview: false }),
      ).pipe(Effect.provide(makePublishLayer(workspace)));

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
        publishArgs(registry.url, { selectors: ["@acme/skills/review"], preview: false }),
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
        execution: { status: "completed", outcomes: [{ status: "success" }] },
      });
    }),
  );
});

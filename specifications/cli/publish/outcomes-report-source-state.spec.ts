import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { afterEach } from "vitest";

import {
  PublishResultSchema,
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
  requirement: "cli/publish/outcomes-report-source-state",
  title: "Machine publish outcomes report source state against Git HEAD",
  statement:
    "When publish compares an extension's archive with Git, each machine outcome for that extension shall carry a schema-backed source-state report naming its basis, whether it matches HEAD, differs from HEAD, or has no HEAD, the HEAD revision when one exists, and the list and count of material differences, and an outcome for an extension outside Git shall carry no source-state report.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "trustworthy-distribution"],
  methods: ["contract"],
  derivedFrom: ["cli/publish/requires-explicit-acceptance-for-non-head-source"],
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

const decodePublishResult = Schema.decodeUnknownEffect(PublishResultSchema);

describe("Source state in machine publish outcomes", () => {
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

  /** The single outcome of the last rendered publish document, decoded against the published schema. */
  const lastOutcome = (workspace: ReturnType<typeof makeSpecWorkspace>) =>
    Effect.gen(function* () {
      const document = yield* decodePublishResult(workspace.rendererState.results.at(-1)?.data);
      expect(document.execution.outcomes).toHaveLength(1);
      return { document, outcome: document.execution.outcomes[0] };
    });

  it.effect("reports an archive represented by HEAD with its revision and no differences", () =>
    Effect.gen(function* () {
      const { workspace, registry } = setup();

      yield* handleRootPublish(
        publishArgs(registry.url, { selectors: ["@acme/skills/review"] }),
      ).pipe(Effect.provide(makePublishLayer(workspace, gitComparison([]))));

      const { outcome } = yield* lastOutcome(workspace);
      expect(outcome?.sourceState).toMatchObject({
        basis: "git-head",
        status: "matches-head",
        revision,
        differences: [],
        differenceCount: 0,
      });
    }),
  );

  it.effect(
    "lists and counts every material difference from HEAD beside the required override",
    () =>
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

        const { document, outcome } = yield* lastOutcome(workspace);
        expect(outcome?.sourceState).toMatchObject({
          basis: "git-head",
          status: "differs-from-head",
          revision,
          differences,
          differenceCount: 3,
        });
        expect(document.execution.riskConditions).toEqual([
          expect.objectContaining({
            level: "override-required",
            policy: "accept-warnings",
            requiredFlag: "--accept-warnings",
          }),
        ]);
      }),
  );

  it.effect("reports a repository without HEAD as having no revision to compare against", () =>
    Effect.gen(function* () {
      const { workspace, registry } = setup();

      yield* handleRootPublish(
        publishArgs(registry.url, { selectors: ["@acme/skills/review"] }),
      ).pipe(
        Effect.provide(
          makePublishLayer(workspace, gitComparison([{ path: "skill.json", change: "added" }], {})),
        ),
      );

      const { outcome } = yield* lastOutcome(workspace);
      expect(outcome?.sourceState).toMatchObject({ basis: "git-head", status: "no-head" });
      expect(outcome?.sourceState).not.toHaveProperty("revision");
    }),
  );

  it.effect("reports differences confined to excluded paths as represented by HEAD", () =>
    Effect.gen(function* () {
      const { workspace, registry } = setup(["evals/*"]);
      fs.mkdirSync(path.join(workspace.root, "skills", "review", "evals"), { recursive: true });
      fs.writeFileSync(path.join(workspace.root, "skills", "review", "evals", "case.json"), "{}\n");

      yield* handleRootPublish(
        publishArgs(registry.url, { selectors: ["@acme/skills/review"] }),
      ).pipe(
        Effect.provide(
          makePublishLayer(
            workspace,
            gitComparison([{ path: "evals/case.json", change: "modified" }]),
          ),
        ),
      );

      const { outcome } = yield* lastOutcome(workspace);
      expect(outcome?.sourceState).toMatchObject({
        status: "matches-head",
        differences: [],
        differenceCount: 0,
      });
    }),
  );

  it.effect("carries no source-state report for an extension outside Git", () =>
    Effect.gen(function* () {
      const { workspace, registry } = setup();

      yield* handleRootPublish(
        publishArgs(registry.url, { selectors: ["@acme/skills/review"], preview: false }),
      ).pipe(Effect.provide(makePublishLayer(workspace)));

      const { outcome } = yield* lastOutcome(workspace);
      expect(outcome).toMatchObject({ status: "success" });
      expect(outcome).not.toHaveProperty("sourceState");
    }),
  );
});

import { fileURLToPath } from "node:url";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makePublicationSpecContext } from "../support/publication-evidence-harness.js";
import {
  type RootPublishArgs,
  writeAuthoredPack,
  writeAuthoredSkill,
} from "../support/publish-harness.js";

import {
  makePublicationCommandFixture,
  publicationTypes,
  readPublicationCommandResult,
} from "../support/publication-command-fixture.js";
import { snapshotWorkspaceContent } from "../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/publication-selects-matching-authored-extensions",
  title: "Publication selectors and filters narrow the workspace-authored set",
  statement:
    "Root publish shall select matching workspace-authored extensions using fully qualified or type-qualified selectors and globs or argument-free owner, type and exclusion filters, while type-specific publication shall interpret its names, globs, fully qualified selectors and filters only within that type, each defaulting to all authored candidates in its scope.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity"],
  boundary: "process",
  boundaryRationale:
    "The root selection table exercises actual publication orchestration and stored archives; the type-specific table enters the built CLI to verify adapter normalization before the same handler runs.",
  methods: ["decision-table", "example"],
  derivedFrom: [
    "cli/publish/selectors-and-filters-narrow-authored-candidates",
    "packages/cli/help/topics/publish.md",
    "packages/cli/src/root/publish/command.ts",
    "packages/cli/src/root/publish/per-type-command.ts",
  ],
  supersedes: ["cli/publish/selectors-and-filters-narrow-authored-candidates"],
  assumptions: [],
  openQuestions: [
    "For an explicit selector with no match, including a fully qualified name of another type at a type-specific command, which diagnostic and result status are required? The selection must not broaden, but this owner does not fix the no-match reporting policy.",
  ],
  limitations: [
    {
      limitation:
        "The process examples use file Registry destinations and a bounded selector/filter decision table. They do not establish every glob shape, repeated-filter combination, or remote Registry interaction.",
      retirementCondition:
        "Retain the type-bound selection evidence while adding any newly accepted selector grammar and interaction cases under their exact applicability.",
    },
  ],
});

describe("Publication selection", () => {
  const cases: ReadonlyArray<{
    name: string;
    args: Partial<RootPublishArgs>;
    expected: ReadonlyArray<string>;
  }> = [
    {
      name: "all authored entries",
      args: {},
      expected: ["@acme/packs/toolkit", "@acme/skills/deploy", "@acme/skills/review"],
    },
    {
      name: "type-qualified name",
      args: { selectors: ["skills/review"] },
      expected: ["@acme/skills/review"],
    },
    {
      name: "fully qualified name",
      args: { selectors: ["@acme/packs/toolkit"] },
      expected: ["@acme/packs/toolkit"],
    },
    {
      name: "explicit glob",
      args: { selectors: ["@acme/skills/*"] },
      expected: ["@acme/skills/deploy", "@acme/skills/review"],
    },
    { name: "type filter", args: { types: ["pack"] }, expected: ["@acme/packs/toolkit"] },
    {
      name: "owner and type filters",
      args: { owners: ["@acme"], types: ["skill"], excludes: ["@acme/skills/deploy"] },
      expected: ["@acme/skills/review"],
    },
    { name: "unmatched owner filter", args: { owners: ["@other"] }, expected: [] },
    {
      name: "overlapping explicit selectors",
      args: { selectors: ["skills/review", "@acme/skills/review", "@acme/skills/*"] },
      expected: ["@acme/skills/deploy", "@acme/skills/review"],
    },
  ];
  for (const scenario of cases) {
    it.effect(scenario.name, () =>
      Effect.scoped(
        Effect.gen(function* () {
          const context = yield* makePublicationSpecContext({
            settings: {
              skills: { review: "workspace", deploy: "workspace" },
              packs: { toolkit: "workspace" },
            },
          });
          writeAuthoredSkill(context.workspace.root, { name: "review" });
          writeAuthoredSkill(context.workspace.root, { name: "deploy" });
          writeAuthoredPack(context.workspace.root, { name: "toolkit" });
          yield* context.run(scenario.args);
          const result = yield* context.result();
          expect(
            result.execution.outcomes
              .filter(({ status }) => status === "success")
              .map(({ id }) => id)
              .sort(),
          ).toEqual(scenario.expected);
          expect(result.counts.published).toBe(scenario.expected.length);
          expect(
            context.registry
              .storedFiles()
              .filter((file) => file.endsWith(".zip"))
              .sort(),
          ).toEqual(scenario.expected.map((id) => `extensions/${id}/1.0.0.zip`));
        }),
      ),
    );
  }
  for (const preview of [true, false]) {
    it.effect(
      `reports an empty authored selection as a no-op in ${preview ? "preview" : "apply"}`,
      () =>
        Effect.scoped(
          Effect.gen(function* () {
            const context = yield* makePublicationSpecContext();
            yield* context.run({ preview });
            const result = yield* context.result();
            expect(result.selection.mode).toBe("authored");
            expect(result.execution.outcomes).toEqual([]);
            expect(result.counts).toMatchObject({ selected: 0, published: 0, failed: 0 });
            expect(context.registry.storedFiles()).toEqual([]);
          }),
        ),
    );
    it.effect(
      `includes an authored extension disabled for installation in ${preview ? "preview" : "apply"}`,
      () =>
        Effect.scoped(
          Effect.gen(function* () {
            const context = yield* makePublicationSpecContext({
              settings: { skills: { review: { source: "workspace", enabled: false } } },
            });
            writeAuthoredSkill(context.workspace.root, { name: "review" });
            yield* context.run({ preview });
            const result = yield* context.result();
            expect(result.execution.outcomes).toEqual([
              expect.objectContaining({
                id: "@acme/skills/review",
                authored: true,
                sourceType: "workspace",
                status: preview ? "pending" : "success",
              }),
            ]);
            if (!preview) expect(context.archive("review").length).toBeGreaterThan(0);
          }),
        ),
    );
  }
});

describe("Type-specific publication selection", () => {
  for (const type of publicationTypes) {
    const cases = [
      {
        name: "all authored entries in this type",
        arguments: [],
        expected: ["redwood", "review", "unrelated"],
      },
      { name: "bare name", arguments: ["review"], expected: ["review"] },
      { name: "bare glob", arguments: ["r*"], expected: ["redwood", "review"] },
      {
        name: "fully qualified selector",
        arguments: [`@acme/${type.route}/review`],
        expected: ["review"],
      },
      {
        name: "owner and type-relative exclusion",
        arguments: ["--owner", "@acme", "--exclude", "red*"],
        expected: ["review", "unrelated"],
      },
      { name: "unmatched owner filter", arguments: ["--owner", "@another"], expected: [] },
    ] as const;
    for (const scenario of cases) {
      it(`${type.route} publish: ${scenario.name}`, async () => {
        const fixture = makePublicationCommandFixture(type);
        try {
          const result = await fixture.run(
            [type.route, "publish", ...scenario.arguments],
            ["--registry-url", fixture.selected.url],
          );
          expect(result.exitCode, result.stdout + result.stderr).toBe(0);
          const expectedArchives = scenario.expected.map(
            (name) => `extensions/@acme/${type.route}/${name}/1.0.0.zip`,
          );
          expect(fixture.selectedArchives()).toEqual(expectedArchives);
          for (const archive of expectedArchives)
            expect(fixture.archiveBytes(archive).length).toBeGreaterThan(0);
          expect(fixture.distractor.storedFiles()).toEqual([]);
          const document = readPublicationCommandResult(result.stdout);
          expect(document.counts.published).toBe(scenario.expected.length);
          expect(
            document.execution.outcomes
              .filter((item) => item.status === "success")
              .map((item) => item.id)
              .sort(),
          ).toEqual(scenario.expected.map((name) => `@acme/${type.route}/${name}`));
        } finally {
          fixture.cleanup();
        }
      }, 120_000);
    }
    it(`${type.route} publish never widens to a foreign-type fully qualified selector`, async () => {
      const fixture = makePublicationCommandFixture(type);
      try {
        // Affirmative control establishes a working own-type publication first.
        const own = await fixture.run(
          [type.route, "publish", "review"],
          ["--registry-url", fixture.selected.url],
        );
        expect(own.exitCode, own.stdout + own.stderr).toBe(0);
        expect(
          fixture.archiveBytes(`extensions/@acme/${type.route}/review/1.0.0.zip`).length,
        ).toBeGreaterThan(0);
        const before = snapshotWorkspaceContent(fileURLToPath(fixture.selected.url));
        const foreign = await fixture.run(
          [type.route, "publish", `@acme/${fixture.foreign}/review`],
          ["--registry-url", fixture.selected.url],
        );
        // Require a real CLI response; a process-launch failure cannot satisfy absence.
        Schema.decodeUnknownSync(Schema.Struct({ ok: Schema.Boolean }))(JSON.parse(foreign.stdout));
        // Exact rejection/no-match status remains an open decision; the promised
        // selection boundary forbids publishing the valid foreign-type package.
        expect(snapshotWorkspaceContent(fileURLToPath(fixture.selected.url))).toEqual(before);
        expect(fixture.distractor.storedFiles()).toEqual([]);
      } finally {
        fixture.cleanup();
      }
    }, 120_000);
  }
});

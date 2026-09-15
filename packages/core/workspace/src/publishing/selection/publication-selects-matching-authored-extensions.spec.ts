import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { normalizeTypePublishSelection, type PublishRequest } from "../publish/model.js";
import { authoredSettingsKey } from "../testing.js";
import {
  makePublishWorld,
  publishDocument,
  requestFor,
  runPublish,
  type PublishWorld,
} from "../test-helpers.js";
import type { PublishableType } from "../publishable-types.js";

export const specification = defineSpecification({
  requirement: "cli/publication-selects-matching-authored-extensions",
  title: "Publication selectors and filters narrow the workspace-authored set",
  statement:
    "Root publish shall select matching workspace-authored extensions using fully qualified or type-qualified selectors and globs or argument-free owner, type and exclusion filters, while type-specific publication shall interpret its names, globs, fully qualified selectors and filters only within that type, each defaulting to all authored candidates in its scope.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity"],
  boundary: "memory",
  boundaryRationale:
    "Selection is decided by the publish use case over the workspace's authored records; running it against a real file Registry shows exactly which archives the selection distributed.",
  methods: ["decision-table", "example"],
  derivedFrom: [
    "cli/publish/selectors-and-filters-narrow-authored-candidates",
    "apps/cli/help/topics/publish.md",
    "apps/cli/src/root/publish/command.ts",
    "apps/cli/src/root/publish/per-type-command.ts",
  ],
  supersedes: ["cli/publish/selectors-and-filters-narrow-authored-candidates"],
  assumptions: [],
  openQuestions: [
    "For an explicit selector with no match, including a fully qualified name of another type at a type-specific command, which diagnostic and result status are required? The selection must not broaden, but this owner does not fix the no-match reporting policy.",
  ],
  limitations: [
    {
      limitation:
        "The examples use file Registry destinations and a bounded selector/filter decision table. They do not establish every glob shape, repeated-filter combination, or remote Registry interaction.",
      retirementCondition:
        "Retain the type-bound selection evidence while adding any newly accepted selector grammar and interaction cases under their exact applicability.",
    },
  ],
});

/** Every publishable type, with the settings key and route segment it uses. */
const publicationTypes = [
  { type: "skill", route: "skills" },
  { type: "mcp-server", route: "mcps" },
  { type: "subagent", route: "subagents" },
  { type: "rule", route: "rules" },
  { type: "hook", route: "hooks" },
  { type: "knowledge", route: "knowledge" },
  { type: "pack", route: "packs" },
] as const satisfies ReadonlyArray<{ readonly type: PublishableType; readonly route: string }>;

/** The archives a run actually distributed into its Registry. */
const publishedArchives = (world: PublishWorld): ReadonlyArray<string> =>
  world.target
    .storedFiles()
    .filter((file) => file.endsWith(".zip"))
    .sort();

describe("Publication selection", () => {
  const worlds: Array<PublishWorld> = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.cleanup();
  });

  const worldWith = (settings: Readonly<Record<string, unknown>>) => {
    const world = makePublishWorld({ settings });
    worlds.push(world);
    return world;
  };

  const cases: ReadonlyArray<{
    name: string;
    args: Partial<PublishRequest>;
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
      Effect.gen(function* () {
        const world = worldWith({
          skills: { review: "workspace", deploy: "workspace" },
          packs: { toolkit: "workspace" },
        });
        world.write("skill", { name: "review" });
        world.write("skill", { name: "deploy" });
        world.write("pack", { name: "toolkit" });

        const outcome = yield* world.provide(
          runPublish(requestFor(world, { preview: false, ...scenario.args })),
        );
        const result = publishDocument(outcome);

        expect(
          result.execution.outcomes
            .filter(({ status }) => status === "success")
            .map(({ id }) => id)
            .sort(),
        ).toEqual(scenario.expected);
        expect(result.counts.published).toBe(scenario.expected.length);
        expect(publishedArchives(world)).toEqual(
          scenario.expected.map((id) => `extensions/${id}/1.0.0.zip`),
        );
      }),
    );
  }

  for (const preview of [true, false]) {
    it.effect(
      `reports an empty authored selection as a no-op in ${preview ? "preview" : "apply"}`,
      () =>
        Effect.gen(function* () {
          const world = worldWith({});

          const outcome = yield* world.provide(runPublish(requestFor(world, { preview })));
          const result = publishDocument(outcome);

          expect(result.selection.mode).toBe("authored");
          expect(result.execution.outcomes).toEqual([]);
          expect(result.counts).toMatchObject({ selected: 0, published: 0, failed: 0 });
          expect(world.target.storedFiles()).toEqual([]);
        }),
    );

    it.effect(
      `includes an authored extension disabled for installation in ${preview ? "preview" : "apply"}`,
      () =>
        Effect.gen(function* () {
          const world = worldWith({
            skills: { review: { source: "workspace", enabled: false } },
          });
          world.write("skill", { name: "review" });

          const outcome = yield* world.provide(runPublish(requestFor(world, { preview })));
          const result = publishDocument(outcome);

          expect(result.execution.outcomes).toEqual([
            expect.objectContaining({
              id: "@acme/skills/review",
              authored: true,
              sourceType: "workspace",
              status: preview ? "pending" : "success",
            }),
          ]);
          if (!preview) expect(world.archive("review").length).toBeGreaterThan(0);
        }),
    );
  }
});

describe("Type-specific publication selection", () => {
  const worlds: Array<PublishWorld> = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.cleanup();
  });

  for (const type of publicationTypes) {
    const cases = [
      {
        name: "all authored entries in this type",
        selectors: [],
        owners: [],
        excludes: [],
        expected: ["redwood", "review", "unrelated"],
      },
      {
        name: "bare name",
        selectors: ["review"],
        owners: [],
        excludes: [],
        expected: ["review"],
      },
      {
        name: "bare glob",
        selectors: ["r*"],
        owners: [],
        excludes: [],
        expected: ["redwood", "review"],
      },
      {
        name: "fully qualified selector",
        selectors: [`@acme/${type.route}/review`],
        owners: [],
        excludes: [],
        expected: ["review"],
      },
      {
        name: "owner and type-relative exclusion",
        selectors: [],
        owners: ["@acme"],
        excludes: ["red*"],
        expected: ["review", "unrelated"],
      },
      {
        name: "unmatched owner filter",
        selectors: [],
        owners: ["@another"],
        excludes: [],
        expected: [],
      },
    ] as const;

    for (const scenario of cases) {
      it.effect(`${type.route} publish: ${scenario.name}`, () =>
        Effect.gen(function* () {
          const world = makePublishWorld({
            settings: {
              [authoredSettingsKey[type.type]]: {
                review: "workspace",
                redwood: "workspace",
                unrelated: "workspace",
              },
            },
          });
          worlds.push(world);
          for (const name of ["review", "redwood", "unrelated"]) world.write(type.type, { name });

          const selection = yield* normalizeTypePublishSelection({
            type: type.type,
            selectors: scenario.selectors,
            owners: scenario.owners,
            excludes: scenario.excludes,
          });
          const outcome = yield* world.provide(
            runPublish(requestFor(world, { preview: false, ...selection })),
          );
          const result = publishDocument(outcome);

          expect(result.counts.published).toBe(scenario.expected.length);
          expect(
            result.execution.outcomes
              .filter((item) => item.status === "success")
              .map((item) => item.id)
              .sort(),
          ).toEqual(scenario.expected.map((name) => `@acme/${type.route}/${name}`));
          expect(publishedArchives(world)).toEqual(
            scenario.expected.map((name) => `extensions/@acme/${type.route}/${name}/1.0.0.zip`),
          );
        }),
      );
    }

    it.effect(`${type.route} publish never widens to a foreign-type fully qualified selector`, () =>
      Effect.gen(function* () {
        const foreign = type.route === "skills" ? "rules" : "skills";
        const result = yield* normalizeTypePublishSelection({
          type: type.type,
          selectors: [`@acme/${foreign}/review`],
          owners: [],
          excludes: [],
        }).pipe(Effect.result);
        expect(result._tag).toBe("Failure");
      }),
    );
  }
});

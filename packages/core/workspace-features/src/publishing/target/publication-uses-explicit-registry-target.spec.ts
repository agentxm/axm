import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { authoredSettingsKey, makePublishTarget } from "../testing.js";
import {
  expectPublishFailed,
  makePublishWorld,
  makeRemotePublishWorld,
  remoteRequest,
  remotePublicationRegistry,
  publishDocument,
  runPublish,
  type PublishWorld,
} from "../test-helpers.js";
import { normalizeTypePublishSelection, type PublishRequest } from "../publish/model.js";
import type { PublishableType } from "../publishable-types.js";

export const specification = defineSpecification({
  requirement: "cli/publication-uses-explicit-registry-target",
  title: "Publication uses the explicitly selected Registry",
  statement:
    "When exactly one Registry target is supplied for publication — a configured Registry by name, or an absolute HTTP(S) URL without credentials, query or fragment — AXM shall direct the admitted publication to that Registry and refuse a target it cannot resolve without publishing anywhere.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "workspace-intent-fidelity"],
  boundary: "memory",
  boundaryRationale:
    "The publish use case resolves the target against the workspace's configured sources; real file Registries distinguish configured targets; an HTTP transport fixture observes direct URL publication.",
  methods: ["decision-table", "example"],
  derivedFrom: [
    "apps/cli/src/root/publish/command.ts",
    "apps/cli/src/root/publish/per-type-command.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "The HTTP transport fixture exercises client selection and uploads without a live Registry; server storage and remote authentication remain separately owned.",
      retirementCondition:
        "Retain explicit target selection evidence at the deployed Registry boundary.",
    },
  ],
});

/** Every publishable type, with the route segment its archives land under. */
const publicationTypes = [
  { type: "skill", route: "skills" },
  { type: "mcp-server", route: "mcps" },
  { type: "subagent", route: "subagents" },
  { type: "rule", route: "rules" },
  { type: "hook", route: "hooks" },
  { type: "knowledge", route: "knowledge" },
  { type: "pack", route: "packs" },
] as const satisfies ReadonlyArray<{ readonly type: PublishableType; readonly route: string }>;

/**
 * Two configured file Registries — one named `selected`, one named
 * `distractor` — over a workspace authoring three packages of one type. The
 * distractor is configured first, so a publication that ignored the requested
 * target would land there.
 */
const makeTwoRegistryWorld = (type: (typeof publicationTypes)[number]) => {
  const world = makePublishWorld();
  const selected = makePublishTarget(world.root, "selected-target");
  const distractor = makePublishTarget(world.root, "other-target");
  const foreign = type.route === "skills" ? "rule" : "skill";
  world.writeSettings({
    owner: "@acme",
    agents: [],
    defaultRegistry: "selected",
    sources: [
      { name: "distractor", type: "registry", location: distractor.url },
      { name: "selected", type: "registry", location: selected.url },
    ],
    [authoredSettingsKey[type.type]]: {
      review: { source: "workspace" },
      redwood: { source: "workspace" },
      unrelated: { source: "workspace" },
    },
    [authoredSettingsKey[foreign]]: { review: { source: "workspace" } },
  });
  for (const name of ["review", "redwood", "unrelated"]) world.write(type.type, { name });
  world.write(foreign, { name: "review" });
  return {
    world,
    selected,
    distractor,
    selectedArchives: () =>
      selected
        .storedFiles()
        .filter((file) => file.endsWith(".zip"))
        .sort(),
  };
};

/** A publish request that names no target of its own; the row supplies one. */
const targetedRequest = (overrides: Partial<PublishRequest>): PublishRequest => ({
  selectors: [],
  owners: [],
  types: [],
  excludes: [],
  registry: Option.none(),
  backfill: false,
  acceptWarnings: false,
  preview: false,
  scope: "project",
  visibility: Option.none(),
  includeDependencies: false,
  unattended: true,
  ...overrides,
});

describe("Explicit publication Registry target", () => {
  const worlds: Array<PublishWorld> = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.cleanup();
  });

  it.effect("publish preview reports the settings-selected default destination", () =>
    Effect.gen(function* () {
      const fixture = makeTwoRegistryWorld(publicationTypes[0]);
      worlds.push(fixture.world);

      const outcome = yield* fixture.world.provide(
        runPublish(
          targetedRequest({
            selectors: ["@acme/skills/review"],
            preview: true,
          }),
        ),
      );

      expect(publishDocument(outcome).selection.registry).toBe("selected");
      expect(fixture.selected.storedFiles()).toEqual([]);
      expect(fixture.distractor.storedFiles()).toEqual([]);
    }),
  );

  for (const type of publicationTypes) {
    it.effect(
      `${type.route} publish uses the configured name without publishing to another Registry`,
      () =>
        Effect.gen(function* () {
          const fixture = makeTwoRegistryWorld(type);
          worlds.push(fixture.world);

          const selection = yield* normalizeTypePublishSelection({
            type: type.type,
            selectors: ["review"],
            owners: [],
            excludes: [],
          });
          const outcome = yield* fixture.world.provide(
            runPublish(
              targetedRequest({
                ...selection,
                registry: Option.some("selected"),
              }),
            ),
          );

          const archive = `extensions/@acme/${type.route}/review/1.0.0.zip`;
          expect(fixture.selectedArchives()).toEqual([archive]);
          expect(publishDocument(outcome).counts.published).toBe(1);
          expect(fixture.distractor.storedFiles()).toEqual([]);
        }),
    );
  }

  it.effect("publishes to an explicit HTTP URL without a configured source", () =>
    Effect.gen(function* () {
      const world = makeRemotePublishWorld({ settings: { skills: { review: "workspace" } } });
      worlds.push(world);
      world.write("skill", { name: "review" });
      const outcome = yield* world.provide(runPublish(remoteRequest()));
      expect(publishDocument(outcome).counts.published).toBe(1);
      expect(world.uploads).toHaveLength(1);
      expect(
        world.requests.every((request) => request.url.startsWith(remotePublicationRegistry + "/")),
      ).toBe(true);
    }),
  );

  for (const target of [
    "name",
    "missing-name",
    "file:///unsupported",
    "ftp://example.test",
    "https://user:password@example.test",
    "https://example.test?query=value",
    "https://example.test#fragment",
  ] as const) {
    it.effect(`root publish resolves ${target} before distributing anything`, () =>
      Effect.gen(function* () {
        const type = publicationTypes[0];
        const fixture = makeTwoRegistryWorld(type);
        worlds.push(fixture.world);

        const request = targetedRequest({
          selectors: ["@acme/skills/review"],
          registry: Option.some(
            target === "name" ? "selected" : target === "missing-name" ? "missing" : target,
          ),
        });

        if (target === "name") {
          const outcome = yield* fixture.world.provide(runPublish(request));
          const archive = "extensions/@acme/skills/review/1.0.0.zip";
          expect(fixture.selectedArchives()).toEqual([archive]);
          expect(publishDocument(outcome).counts.published).toBe(1);
        } else {
          const failure = expectPublishFailed(
            yield* fixture.world.provide(Effect.flip(runPublish(request))),
          );
          expect(failure.detail).toContain(target === "missing-name" ? "missing" : "--registry");
          expect(fixture.selected.storedFiles()).toEqual([]);
        }
        expect(fixture.distractor.storedFiles()).toEqual([]);
      }),
    );
  }
});

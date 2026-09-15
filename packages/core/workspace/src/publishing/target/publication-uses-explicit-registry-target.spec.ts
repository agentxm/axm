import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { authoredSettingsKey, makePublishTarget } from "../testing.js";
import {
  expectPublishFailed,
  makePublishWorld,
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
    "When exactly one Registry target is supplied for publication — a configured Registry by name, or an explicit Registry URL — AXM shall direct the admitted publication to that Registry and refuse a target it cannot resolve without publishing anywhere.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "workspace-intent-fidelity"],
  boundary: "memory",
  boundaryRationale:
    "The publish use case resolves the target against the workspace's configured sources; two real file Registries show the admitted publication landing at the selected destination and the other staying empty.",
  methods: ["decision-table", "example"],
  derivedFrom: [
    "apps/cli/src/root/publish/command.ts",
    "apps/cli/src/root/publish/per-type-command.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "What target or rejection is required when both a configured name and an explicit URL are supplied? The current implementation prefers the URL and retains the supplied name as a label; no public precedence promise was identified.",
    "Which Registry should a publication without either target select? The current implementation takes the first resolved Registry source; this requirement does not establish that default or source-order policy.",
    "Which URL schemes are supported publication targets beyond the existing local Registry and HTTP implementations? No new scheme support or normalization guarantee is established here.",
  ],
  limitations: [
    {
      limitation:
        "The examples use local file Registry destinations. HTTP publication capability binding and credential-origin isolation remain separately owned; no live Registry, remote authentication, or server-side storage behavior is established here.",
      retirementCondition:
        "Retain explicit target selection evidence through each supported target transport without duplicating the credential and publication-capability owners.",
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
    sources: [
      { name: "distractor", type: "registry", location: distractor.url },
      { name: "selected", type: "registry", location: selected.url },
    ],
    [authoredSettingsKey[type.type]]: {
      review: "workspace",
      redwood: "workspace",
      unrelated: "workspace",
    },
    [authoredSettingsKey[foreign]]: { review: "workspace" },
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
  registryUrl: Option.none(),
  onExisting: Option.none(),
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

  for (const type of publicationTypes) {
    for (const targetForm of ["configured name", "explicit URL"] as const) {
      it.effect(
        `${type.route} publish uses the ${targetForm} without publishing to another configured Registry`,
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
                  ...(targetForm === "configured name"
                    ? { registry: Option.some("selected") }
                    : { registryUrl: Option.some(fixture.selected.url) }),
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
  }

  for (const target of ["name", "url", "missing-name", "invalid-url"] as const) {
    it.effect(`root publish resolves ${target} before distributing anything`, () =>
      Effect.gen(function* () {
        const type = publicationTypes[0];
        const fixture = makeTwoRegistryWorld(type);
        worlds.push(fixture.world);

        const request = targetedRequest({
          selectors: ["@acme/skills/review"],
          ...(target === "name"
            ? { registry: Option.some("selected") }
            : target === "url"
              ? { registryUrl: Option.some(fixture.selected.url) }
              : target === "missing-name"
                ? { registry: Option.some("missing") }
                : { registryUrl: Option.some("not a Registry URL") }),
        });

        if (target === "name" || target === "url") {
          const outcome = yield* fixture.world.provide(runPublish(request));
          const archive = "extensions/@acme/skills/review/1.0.0.zip";
          expect(fixture.selectedArchives()).toEqual([archive]);
          expect(publishDocument(outcome).counts.published).toBe(1);
        } else {
          const failure = expectPublishFailed(
            yield* fixture.world.provide(Effect.flip(runPublish(request))),
          );
          expect(failure.detail).toContain(
            target === "missing-name" ? "missing" : "--registry-url",
          );
          expect(fixture.selected.storedFiles()).toEqual([]);
        }
        expect(fixture.distractor.storedFiles()).toEqual([]);
      }),
    );
  }
});

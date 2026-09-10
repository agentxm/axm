import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  makeCanonicalRequirementValidator,
  readCommandInventory,
} from "../../support/command-inventory.js";
import {
  readContextInventory,
  observeContextPopulations,
  observeAgentPartitions,
  requireContextSourceFile,
  type ContextMember,
} from "../../support/context-inventory.js";

export const specification = defineSpecification({
  requirement: "system/process/context-inventory-routes-to-obligations",
  title: "The context inventory identifies owners and their applicability",
  statement:
    "The repository shall maintain a context inventory whose declared finite populations agree with their named authoritative sources and whose bindings identify canonical specification owners with stated applicability, named interface authority, or explicit unresolved scope.",
  class: "process",
  role: "supporting",
  goals: ["dependable-change-process"],
  boundary: "repository",
  boundaryRationale:
    "The gate reads current catalogs, published schema fields, one named flat source declaration and canonical specification identities; it checks inventory freshness and explicit allocation, without executing allocated product obligations.",
  methods: ["static", "contract"],
  derivedFrom: ["system/process/command-inventory-routes-to-obligations"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "A resolvable owner and a nonempty applicability condition do not establish that the condition is semantically correct or that all behavior and combinations have been specified.",
      retirementCondition:
        "Review changed context associations against intended obligations and attributable behavioral evidence; membership checks alone cannot retire this limit.",
    },
    {
      limitation:
        "Unchanged catalog or enum membership does not detect changed meaning, and dynamic agent partition checks do not establish vendor conformance or supported installation behavior.",
      retirementCondition:
        "Use source and requirement impact review plus the applicable product evidence for changes to meaning or behavior.",
    },
  ],
});

const nonempty = (value: string, label: string) =>
  expect(value.trim().length, label).toBeGreaterThan(0);
const unique = (values: ReadonlyArray<string>, label: string) =>
  expect(new Set(values).size, label).toBe(values.length);
const normalized = (members: ReadonlyArray<ContextMember>) =>
  members.map((value) => JSON.stringify(value)).sort();

describe("Context inventory navigation", () => {
  it.effect("resolves every allocation and requires applicability for canonical owners", () =>
    Effect.gen(function* () {
      const inventory = yield* readContextInventory();
      const commandInventory = yield* readCommandInventory();
      const canonicalRequirement = makeCanonicalRequirementValidator();
      for (const [name, population] of Object.entries(inventory.populations)) {
        nonempty(population.symbol, `${name} interface symbol`);
        requireContextSourceFile(population.path);
      }
      for (const [name, topic] of Object.entries(inventory.openTopics)) {
        nonempty(topic.question, `${name} unresolved scope`);
        expect(
          topic.nearestRequirement !== undefined || topic.boundary !== undefined,
          `${name} must identify its nearest owner or public boundary`,
        ).toBe(true);
        if (topic.nearestRequirement !== undefined) canonicalRequirement(topic.nearestRequirement);
        if (topic.boundary !== undefined) nonempty(topic.boundary, name);
      }
      const usedBindings = new Set<string>();
      for (const [name, dimension] of Object.entries(inventory.dimensions)) {
        nonempty(dimension.family, `${name} family`);
        expect(dimension.groups.length, name).toBeGreaterThan(0);
        if (dimension.population !== undefined) {
          expect(Object.hasOwn(inventory.populations, dimension.population), name).toBe(true);
        } else {
          nonempty(dimension.populationKind ?? "", `${name} context boundary`);
        }
        const memberLabels: Array<string> = [];
        for (const group of dimension.groups) {
          expect(group.bindings.length, `${name} allocation`).toBeGreaterThan(0);
          unique(group.bindings, `${name} binding references`);
          expect(
            (group.members !== undefined) !== (group.selector !== undefined),
            `${name} group has either explicit members or a named selector`,
          ).toBe(true);
          if (group.members !== undefined) {
            expect(group.members.length, `${name} members`).toBeGreaterThan(0);
            memberLabels.push(...normalized(group.members));
          }
          for (const binding of group.bindings) {
            expect(Object.hasOwn(inventory.bindings, binding), `${name}: ${binding}`).toBe(true);
            usedBindings.add(binding);
          }
        }
        unique(memberLabels, `${name} member labels`);
      }
      expect([...usedBindings].sort()).toEqual(Object.keys(inventory.bindings).sort());
      for (const [name, binding] of Object.entries(inventory.bindings)) {
        const requirements = binding.requirements ?? [];
        const topics = binding.openTopics ?? [];
        unique(requirements, `${name} owners`);
        unique(topics, `${name} unresolved topics`);
        expect(
          requirements.length > 0 || binding.interface !== undefined || topics.length > 0,
          `${name} must have an allocation; notes alone do not allocate context`,
        ).toBe(true);
        if (requirements.length > 0) {
          nonempty(binding.when ?? "", `${name} owner applicability`);
          for (const requirement of requirements) canonicalRequirement(requirement);
        }
        if (binding.interface !== undefined) {
          expect(Object.hasOwn(inventory.populations, binding.interface), name).toBe(true);
        }
        for (const topic of topics) {
          const external = topic.startsWith("command:");
          const key = external ? topic.slice("command:".length) : topic;
          const topicMap = external ? commandInventory.openTopics : inventory.openTopics;
          expect(Object.hasOwn(topicMap, key), `${name}: ${topic}`).toBe(true);
        }
      }
    }),
  );

  it.effect("matches each declared finite population to its current source", () =>
    Effect.gen(function* () {
      const inventory = yield* readContextInventory();
      const observed = new Map<string, ReadonlyArray<ContextMember>>(
        Object.entries(observeContextPopulations()),
      );
      const compared = new Set<string>();
      for (const [name, dimension] of Object.entries(inventory.dimensions)) {
        const population = dimension.population;
        if (population === undefined || population === "agents") continue;
        const actual = observed.get(population);
        if (actual === undefined) throw new Error(`No finite source observation for ${population}`);
        compared.add(population);
        const selectorGroups = dimension.groups.filter((group) => group.selector !== undefined);
        if (selectorGroups.length > 0) {
          // The reason vocabulary has interface authority only. This selector
          // never claims a behavioral cause owner for every admitted reason.
          expect(population).toBe("publish-reason");
          expect(dimension.groups.length).toBe(1);
          for (const group of selectorGroups) {
            expect(group.selector).toBe("all declared PublishReasonSchema literals");
            for (const bindingName of group.bindings) {
              const binding = inventory.bindings[bindingName];
              if (binding === undefined) throw new Error(`Missing binding ${bindingName}`);
              expect(binding.interface).toBe(population);
              expect(binding.requirements ?? []).toEqual([]);
              nonempty(binding.exclusion ?? "", `${name} interface-only boundary`);
            }
          }
          expect(actual.length, name).toBeGreaterThan(0);
          continue;
        }
        const declared = dimension.groups.flatMap((group) => group.members ?? []);
        expect(normalized(declared), name).toEqual(normalized(actual));
      }
      expect([...compared].sort()).toEqual([...observed.keys()].sort());
      expect(Object.keys(inventory.populations).sort()).toEqual(
        [...observed.keys(), "agents"].sort(),
      );
    }),
  );

  it.effect("partitions the current agent catalog without storing vendor rows", () =>
    Effect.gen(function* () {
      const inventory = yield* readContextInventory();
      const partitions = observeAgentPartitions();
      unique(partitions.catalog, "Catalog agent IDs");
      unique(partitions.configurable, "Configurable agent IDs");
      unique(partitions.hosted, "Hosted agent IDs");
      expect(partitions.configurable.filter((id) => partitions.hosted.includes(id))).toEqual([]);
      expect([...partitions.configurable, ...partitions.hosted].sort()).toEqual(
        [...partitions.catalog].sort(),
      );
      const dimensions = Object.values(inventory.dimensions).filter(
        (dimension) => dimension.population === "agents",
      );
      expect(dimensions.length).toBe(1);
      const labels = dimensions.flatMap((dimension) =>
        dimension.groups.flatMap((group) => group.members ?? []),
      );
      expect(normalized(labels)).toEqual(
        normalized(["configurable-catalog-members", "hosted-only-catalog-members"]),
      );
    }),
  );
});

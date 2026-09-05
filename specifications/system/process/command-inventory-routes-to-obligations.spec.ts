import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { collectHelpFiles } from "axm.sh/specification-harness";
import { COMMAND_ROUTE_ALLOCATION } from "../../support/command-routes.js";
import {
  makeCanonicalRequirementValidator,
  readCommandInventory,
} from "../../support/command-inventory.js";
import {
  observeZeroMinimumRepetition,
  repeatedFlagControls,
} from "../../support/parser-cardinality.js";

export const specification = defineSpecification({
  requirement: "system/process/command-inventory-routes-to-obligations",
  title: "The command inventory routes readers to specification owners",
  statement:
    "The repository shall maintain a command inventory that agrees with rendered-help signatures and reviewed parser occurrence cardinality, and routes each command and parameter to applicable canonical specifications or explicit unresolved scope.",
  class: "process",
  role: "supporting",
  goals: ["dependable-change-process"],
  boundary: "repository",
  boundaryRationale:
    "The gate checks canonical references and agreement with the production help tree and registered-parser occurrence controls; it does not execute allocated product obligations or establish semantic completeness.",
  methods: ["contract", "decision-table"],
  derivedFrom: ["system/architecture/every-command-declares-interaction-capabilities"],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Should the command inventory also compare parser value domains, defaults, constraints, or hidden parameters beyond the rendered-help fields and reviewed occurrence controls?",
  ],
});

const unique = (values: ReadonlyArray<string>, label: string) => {
  expect(new Set(values).size, label).toBe(values.length);
};
const nonempty = (value: string, label: string) => {
  expect(value.trim().length, label).toBeGreaterThan(0);
};
const routeName = (route: string) => (route === "" ? "axm" : `axm ${route}`);

interface Binding {
  readonly requirements?: ReadonlyArray<string>;
  readonly when?: string;
  readonly openTopics?: ReadonlyArray<string>;
  readonly details?: ReadonlyArray<string>;
}

describe("Command inventory navigation", () => {
  it.effect("matches rendered routes and exact rendered parameter fields", () =>
    Effect.gen(function* () {
      const inventory = yield* readCommandInventory();
      const documents = yield* collectHelpFiles();
      const root = documents.get("axm");
      if (root === undefined) throw new Error("Missing root command help");
      const routes = Object.keys(inventory.routes);
      expect([...routes].sort()).toEqual(
        COMMAND_ROUTE_ALLOCATION.map((entry) => entry.path.join(" ")).sort(),
      );
      expect([...documents.keys()].sort()).toEqual(routes.map(routeName).sort());
      for (const route of routes) expect(route).toMatch(/^(?:[a-z0-9-]+(?: [a-z0-9-]+)*)?$/u);
      const globalNames = (root.globalFlags ?? []).map((flag) => flag.name);
      unique(globalNames, "Rendered global flag names");
      expect([...globalNames].sort()).toEqual(Object.keys(inventory.globals).sort());
      for (const flag of root.globalFlags ?? []) {
        const recorded = inventory.globals[flag.name];
        if (recorded === undefined) throw new Error(`Missing global: ${flag.name}`);
        expect(recorded.rawHelp, flag.name).toEqual({
          aliases: flag.aliases,
          type: flag.type,
          required: flag.required,
        });
      }
      for (const [route, row] of Object.entries(inventory.routes)) {
        const name = routeName(route);
        const doc = documents.get(name);
        if (doc === undefined) throw new Error(`Missing command help: ${name}`);
        unique(
          row.flags.map((flag) => flag.name),
          `${name} flags`,
        );
        unique(
          row.arguments.map((argument) => argument.name),
          `${name} arguments`,
        );
        expect(
          row.flags.map(({ name, rawHelp }) => ({ name, ...rawHelp })),
          name,
        ).toEqual(
          doc.flags.map(({ name, aliases, type, required }) => ({ name, aliases, type, required })),
        );
        expect(
          row.arguments.map(({ name, rawHelp }) => ({ name, ...rawHelp })),
          name,
        ).toEqual(
          (doc.args ?? []).map(({ name, type, required, variadic }) => ({
            name,
            type,
            required,
            variadic,
          })),
        );
      }
    }),
  );

  it.effect("validates every reference and explicitly accounts for each parameter position", () =>
    Effect.gen(function* () {
      const inventory = yield* readCommandInventory();
      const canonicalRequirement = makeCanonicalRequirementValidator();
      const usedTopics = new Set<string>();
      const referenceTopics = (topics: ReadonlyArray<string>, label: string) => {
        unique(topics, label);
        for (const topic of topics) {
          expect(Object.hasOwn(inventory.openTopics, topic), `${label}: ${topic}`).toBe(true);
          usedTopics.add(topic);
        }
      };
      const inspectBinding = (binding: Binding, label: string, allowNonallocatingNote = false) => {
        const identities = binding.requirements ?? [];
        const topics = binding.openTopics ?? [];
        const details = binding.details ?? [];
        expect(
          identities.length + topics.length + (allowNonallocatingNote ? details.length : 0),
          label,
        ).toBeGreaterThan(0);
        unique(identities, label);
        for (const identity of identities) canonicalRequirement(identity);
        if (binding.when !== undefined) nonempty(binding.when, label);
        referenceTopics(topics, label);
        for (const detail of details) nonempty(detail, label);
      };
      for (const [name, global] of Object.entries(inventory.globals)) {
        expect(global.bindings.length, name).toBeGreaterThan(0);
        unique(
          global.bindings.map((binding) => JSON.stringify(binding)),
          name,
        );
        expect(
          global.bindings.some(
            (binding) =>
              (binding.requirements?.length ?? 0) + (binding.openTopics?.length ?? 0) > 0,
          ),
          name,
        ).toBe(true);
        for (const binding of global.bindings) inspectBinding(binding, `global ${name}`, true);
      }
      for (const [route, row] of Object.entries(inventory.routes)) {
        unique(row.relatedRequirements, route);
        for (const identity of row.relatedRequirements) canonicalRequirement(identity);
        const conditional = row.conditionalLinks ?? [];
        unique(
          conditional.map((link) => JSON.stringify(link)),
          route,
        );
        for (const link of conditional) {
          canonicalRequirement(link.requirement);
          nonempty(link.when, route);
          referenceTopics(link.openTopics ?? [], route);
        }
        const expected = [
          ...row.flags.map((flag) => `flag:${flag.name}`),
          ...row.arguments.map((argument) => `argument:${argument.name}`),
        ];
        const actual = row.parameterBindings.flatMap((binding) => binding.parameters);
        expect([...new Set(actual)].sort(), route).toEqual([...expected].sort());
        unique(
          row.parameterBindings.map((binding) => JSON.stringify(binding)),
          route,
        );
        for (const binding of row.parameterBindings) {
          expect(binding.parameters.length, route).toBeGreaterThan(0);
          unique(binding.parameters, route);
          inspectBinding(binding, `${route}: ${binding.parameters.join(", ")}`);
        }
        expect(
          row.relatedRequirements.length + conditional.length + row.parameterBindings.length,
          route,
        ).toBeGreaterThan(0);
      }
      for (const [key, topic] of Object.entries(inventory.openTopics)) {
        expect(key).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
        nonempty(topic.topic, key);
        if (topic.nearestSpecification !== undefined)
          canonicalRequirement(topic.nearestSpecification);
      }
      expect([...usedTopics].sort()).toEqual(Object.keys(inventory.openTopics).sort());
    }),
  );

  it.effect("compares declared occurrence metadata with the actual registered parser", () =>
    Effect.gen(function* () {
      const inventory = yield* readCommandInventory();
      const declared = Object.entries(inventory.routes).flatMap(([route, row]) =>
        row.flags.flatMap((flag) =>
          flag.occurrences === undefined
            ? []
            : [{ route, flag: flag.name, occurrences: flag.occurrences }],
        ),
      );
      const position = (entry: { readonly route: string; readonly flag: string }) =>
        `${entry.route}:flag:${entry.flag}`;
      unique(repeatedFlagControls.map(position), "Parser control positions");
      expect(declared.map(position).sort()).toEqual(repeatedFlagControls.map(position).sort());
      for (const fixture of repeatedFlagControls) {
        const expected = declared.find((entry) => position(entry) === position(fixture));
        if (expected === undefined)
          throw new Error(`Missing occurrence declaration: ${position(fixture)}`);
        const observed = yield* observeZeroMinimumRepetition(fixture);
        expect(expected.occurrences, position(fixture)).toEqual(observed);
      }
    }),
  );
});

import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import * as SchemaRepresentation from "effect/SchemaRepresentation";
import { defineSpecification } from "@agentxm/specification-metadata";
import { HELP_TOPICS, HELP_TOPIC_KINDS } from "./__generated__/help-topics.js";
import { MACHINE_OUTPUT_CONTRACT_ROWS } from "./machine-output-contracts.js";
import { makeMachineOutputSchema } from "./machine-output-schemas.js";

export const specification = defineSpecification({
  requirement: "cli/machine-output/publishes-route-result-schemas",
  title: "Machine help publishes generated result schemas for every structured route",
  statement:
    "AXM shall publish generated JSON Schema for every structured-result command through schema help, map each route to its result-family reference, and preserve the generic success envelope and the unfrozen diagnostic-record exception.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation"],
  methods: ["contract", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const jsonObject = Schema.Record(Schema.String, Schema.Unknown);
const published = Schema.decodeUnknownSync(Schema.fromJsonString(jsonObject))(
  HELP_TOPICS["machine-output-schema"],
);
const definitions = Schema.decodeUnknownSync(Schema.Record(Schema.String, jsonObject))(
  published["$defs"],
);
const routes = Schema.decodeUnknownSync(
  Schema.Record(Schema.String, Schema.Struct({ $ref: Schema.String })),
)(published["x-axm-routes"]);

const validatorFor = (route: string) => {
  const reference = routes[route];
  if (reference === undefined) throw new Error(`Unpublished result route ${route}`);
  return Schema.decodeUnknownSync(
    Schema.toType(
      SchemaRepresentation.fromJsonSchemaDocument({
        dialect: "draft-2020-12",
        schema: reference,
        definitions,
      }),
    ),
  );
};

describe("Published route result schemas", () => {
  it("serves the exact generated schema and every structured route reference", () => {
    expect(HELP_TOPIC_KINDS["machine-output-schema"]).toBe("json-schema");
    expect(published).toEqual(makeMachineOutputSchema());
    const rows = MACHINE_OUTPUT_CONTRACT_ROWS.filter(
      (row) => row.family.outputClass === "structured-result",
    );
    expect(Object.keys(routes).sort()).toEqual(rows.map((row) => row.path).sort());
    for (const row of rows) {
      expect(routes[row.path]).toEqual({ $ref: `#/$defs/family.${row.family.id}` });
      expect(definitions[`family.${row.family.id}`]).toEqual({
        anyOf: row.family.schemaNames.map((name) => ({ $ref: `#/$defs/${name}` })),
      });
    }
    expect(published["description"]).toContain("Diagnostic-record contents remain unfrozen");
  });

  it("resolves every local reference in the published document", () => {
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const entry of value) visit(entry);
        return;
      }
      if (typeof value !== "object" || value === null) return;
      for (const [key, entry] of Object.entries(value)) {
        if (key === "$ref" && typeof entry === "string" && entry.startsWith("#/$defs/")) {
          expect(definitions[entry.slice("#/$defs/".length)]).toBeDefined();
        } else visit(entry);
      }
    };
    visit(published);
  });

  it("validates a typed inventory and rejects its superseded representation", () => {
    const decode = validatorFor("axm skills list");
    const item = {
      type: "skill",
      name: "review",
      scope: "project",
      management: "configured",
      installed: false,
      enabled: true,
      source: { kind: "registry", locator: "@acme/skills/review", identity: "@acme/skills/review" },
      agentOutcomes: [],
    };
    const result = {
      filter: "all",
      items: [item],
      count: 1,
      totalCount: 1,
      managementCounts: { configured: 1, implicit: 0, leftover: 0, undeclared: 0, unmanaged: 0 },
    };
    expect(decode(result)).toEqual(result);
    expect(() => decode({ ...result, items: [{ ...item, management: "arbitrary" }] })).toThrow();
    expect(() =>
      decode({ ...result, items: [{ ...item, source: "@acme/skills/review" }] }),
    ).toThrow();
    const { management, ...rest } = item;
    expect(() =>
      decode({
        ...result,
        items: [{ ...rest, classification: { kind: "lifecycle", lifecycle: management } }],
      }),
    ).toThrow();
  });

  it("validates shared show outcomes and rejects the retired agent collection", () => {
    const decode = validatorFor("axm skills show");
    const item = {
      type: "skill",
      name: "review",
      scope: "project",
      enabled: true,
      source: "workspace",
      version: "1.0.0",
      locked: false,
    };
    const agentOutcomes = [
      {
        extensionType: "skill",
        name: "review",
        agentId: "codex",
        outcome: "current",
        reasonCode: "verified-native-unit",
        reason: "The native entry matches accepted content.",
      },
    ];
    expect(decode({ item, agentOutcomes })).toEqual({ item, agentOutcomes });
    expect(() => decode({ item, agents: agentOutcomes })).toThrow();
    expect(() =>
      decode({ item, agentOutcomes: [{ ...agentOutcomes[0], reasonCode: "arbitrary" }] }),
    ).toThrow();
  });
});

import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import * as SchemaRepresentation from "effect/SchemaRepresentation";
import { defineSpecification } from "@agentxm/specification-metadata";
import { HELP_TOPICS, HELP_TOPIC_KINDS } from "./__generated__/help-topics.js";
import { MACHINE_OUTPUT_CONTRACT_ROWS } from "./machine-output-contracts.js";
import { makeMachineOutputSchema } from "./machine-output-schemas.js";

export const specification = defineSpecification({
  requirement: "cli/machine-output/publishes-route-result-schemas",
  title: "Offline discovery publishes complete stdout schemas for every supported contract",
  statement:
    "AXM shall publish offline command stdout contracts through axm schema with concise outlines, declared dotted and array-element field lookup preserving alternatives, standalone JSON Schema exports with only reachable local references, complete ordinary result and generic error and formatter alternatives, explicit credential or unavailable external-schema refusal, finite self-discovery, and the unfrozen diagnostic-record exception.",
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
      SchemaRepresentation.fromJsonSchemaDocument(
        {
          dialect: "draft-2020-12",
          schema: reference,
          definitions,
        },
        { patterns: "apply" },
      ),
    ),
  );
};

const envelope = (result: unknown) => ({ ok: true, mode: "query", outcome: "completed", result });

describe("Published route result schemas", () => {
  it("serves the exact generated schema and every structured route reference", () => {
    expect(HELP_TOPIC_KINDS["machine-output-schema"]).toBe("json-schema");
    expect(published).toEqual(makeMachineOutputSchema());
    const rows = MACHINE_OUTPUT_CONTRACT_ROWS.filter((row) =>
      ["structured-result", "formatter-help", "json-schema-document"].includes(
        row.family.outputClass,
      ),
    );
    expect(Object.keys(routes).sort()).toEqual(rows.map((row) => row.path).sort());
    for (const row of rows) {
      expect(routes[row.path]).toEqual({ $ref: `#/$defs/family.${row.family.id}` });
      expect(definitions[`family.${row.family.id}`]?.["anyOf"]).toBeInstanceOf(Array);
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
      agents: { configured: [], observed: [] },
      inspection: { state: "not-requested" },
    };
    const result = {
      filter: "all",
      items: [item],
      count: 1,
      totalCount: 1,
      managementCounts: { configured: 1, implicit: 0, leftover: 0, undeclared: 0, unmanaged: 0 },
    };
    expect(decode(envelope(result))).toEqual(envelope(result));
    expect(() =>
      decode(envelope({ ...result, items: [{ ...item, management: "arbitrary" }] })),
    ).toThrow();
    expect(() =>
      decode(envelope({ ...result, items: [{ ...item, source: "@acme/skills/review" }] })),
    ).toThrow();
    const { management, ...rest } = item;
    expect(() =>
      decode(
        envelope({
          ...result,
          items: [{ ...rest, classification: { kind: "lifecycle", lifecycle: management } }],
        }),
      ),
    ).toThrow();
  });

  it("validates inspection coverage and rejects the retired single-item show representation", () => {
    const decode = validatorFor("axm skills show");
    const result = {
      scope: "project",
      requests: [
        {
          id: "request:0",
          kind: "identity",
          input: "review",
          resolution: "not-found",
          code: 3,
          subjectRefs: [],
          candidateRefs: [],
          reason: "No selected subject.",
        },
      ],
      items: [],
      supportingSubjects: [],
      nativeLocations: [],
      nativeReaderDeclarations: [],
      observationDiagnostics: [],
      coverage: { state: "complete", reasons: [] },
    };
    const stdout = { ok: false, mode: "query", outcome: "completed", result };
    expect(decode(stdout)).toEqual(stdout);
    expect(() => decode({ ...stdout, result: { item: {}, agentOutcomes: [] } })).toThrow();
    expect(() =>
      decode({ ...stdout, result: { ...result, coverage: { state: "guessed", reasons: [] } } }),
    ).toThrow();
  });
});

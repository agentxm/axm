import { describe, expect, it } from "@effect/vitest";
import {
  declaredFields,
  describeSchema,
  lookupField,
  schemaObject,
  standaloneSchema,
} from "./json-schema.js";

const document = {
  $defs: {
    complete: {
      type: "object",
      properties: {
        outcome: { const: "complete" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              status: { enum: ["present", "absent"] },
              note: { type: ["string", "null"] },
            },
            required: ["status"],
          },
        },
      },
      required: ["outcome", "items"],
    },
    failed: {
      type: "object",
      properties: { outcome: { const: "failed" }, reason: { type: "string" } },
      required: ["outcome", "reason"],
    },
    unrelated: { type: "number" },
  },
};
const root = { anyOf: [{ $ref: "#/$defs/complete" }, { $ref: "#/$defs/failed" }] };

describe("offline schema navigation", () => {
  it("keeps union conditions and required, optional, enum, and null distinctions", () => {
    const status = lookupField(root, document, "items[].status");
    expect(status.alternatives).toEqual([
      {
        schema: { enum: ["present", "absent"] },
        required: true,
        conditions: ['outcome = "complete"'],
      },
    ]);
    const note = lookupField(root, document, "items[].note");
    expect(note.alternatives[0]?.required).toBe(false);
    expect(describeSchema(note.alternatives[0]?.schema ?? false, document)).toBe("string | null");
    expect(lookupField(root, document, "reason").alternatives).toEqual([
      { schema: { type: "string" }, required: true, conditions: ['outcome = "failed"'] },
    ]);
    expect(declaredFields(root, document)).toEqual(["items", "outcome", "reason"]);
  });

  it("distributes alternatives inside intersections instead of flattening their fields", () => {
    const schema = {
      allOf: [
        root,
        { type: "object", properties: { common: { type: "boolean" } }, required: ["common"] },
      ],
    };
    const fields = lookupField(schema, document, "reason");
    expect(fields.alternatives).toEqual([
      { schema: { type: "string" }, required: true, conditions: ['outcome = "failed"'] },
    ]);
    expect(lookupField(schema, document, "common").alternatives).toHaveLength(2);
  });

  it("bounds unknown-field suggestions and rejects arbitrary map keys and malformed paths", () => {
    expect(lookupField(root, document, "items[].state")).toEqual({
      alternatives: [],
      nearby: ["items[].note", "items[].status"],
    });
    expect(lookupField(root, document, "items[0].status").alternatives).toEqual([]);
    const map = {
      type: "object",
      properties: { labels: { type: "object", additionalProperties: { type: "string" } } },
    };
    expect(lookupField(map, {}, "labels.owner").alternatives).toEqual([]);
    expect(
      describeSchema(lookupField(map, {}, "labels").alternatives[0]?.schema ?? false, {}),
    ).toContain("dynamic map keys");
  });

  it("keeps only reachable definitions and preserves recursive references", () => {
    const recursive = {
      $defs: {
        ...document.$defs,
        node: {
          type: "object",
          properties: { next: { anyOf: [{ $ref: "#/$defs/node" }, { type: "null" }] } },
        },
      },
    };
    const output = standaloneSchema(recursive, { $ref: "#/$defs/node" });
    expect(Object.keys(schemaObject(output["$defs"]))).toEqual(["node"]);
    expect(JSON.stringify(output)).toContain('"$ref":"#/$defs/node"');
    expect(JSON.stringify(output).length).toBeLessThan(500);
    expect(Object.keys(schemaObject(standaloneSchema(document, root)["$defs"]))).toEqual([
      "complete",
      "failed",
    ]);
  });

  it("retains root-reference meaning when extracting a selected field", () => {
    const recursive = { type: "object", properties: { child: { $ref: "#" } } };
    const output = standaloneSchema(recursive, recursive.properties.child);
    expect(output["$ref"]).toBe("#/$defs/reference.0");
    expect(schemaObject(output["$defs"])["reference.0"]).toEqual({
      type: "object",
      properties: { child: { $ref: "#/$defs/reference.0" } },
    });
  });

  it("fails dangling and network references without examining literal data as schemas", () => {
    expect(() => standaloneSchema({}, { $ref: "#/$defs/missing" })).toThrow("Unresolved");
    expect(() => standaloneSchema({}, { $ref: "https://example.invalid/schema" })).toThrow(
      "Nonlocal",
    );
    expect(standaloneSchema({}, { const: { $ref: "literal-data" } })["const"]).toEqual({
      $ref: "literal-data",
    });
  });
});

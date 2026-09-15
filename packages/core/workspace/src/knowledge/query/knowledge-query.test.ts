import { describe, expect, it } from "vitest";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import {
  KNOWLEDGE_DISCOVERY_CAPABILITIES,
  KnowledgeDiscoveryCapabilitiesSchema,
} from "./knowledge-capabilities.js";
import {
  KnowledgeQuerySchema,
  makeKnowledgeQuery,
  KNOWLEDGE_QUERY_OPERATORS,
  KNOWLEDGE_SEARCHABLE_FIELDS,
} from "./knowledge-query.js";

describe("Knowledge query contract", () => {
  it("constructs canonical bounded search and enumeration queries", () => {
    const search = makeKnowledgeQuery("project", [{ kind: "term", value: "authentication" }]);
    const enumeration = makeKnowledgeQuery("user", []);

    expect(search).toMatchObject({
      version: "axm-knowledge-query-v1",
      scope: "project",
      ordering: "relevance",
      resultLimit: 25,
      passageLimit: 3,
      passageLength: 500,
    });
    expect(enumeration.ordering).toBe("metadata");
    expect(Result.isSuccess(Schema.decodeUnknownResult(KnowledgeQuerySchema)(search))).toBe(true);
  });

  it("rejects empty values, malformed property pointers, and excessive bounds", () => {
    const decode = Schema.decodeUnknownResult(KnowledgeQuerySchema);
    const base = makeKnowledgeQuery("project", []);

    expect(Result.isFailure(decode({ ...base, clauses: [{ kind: "term", value: "" }] }))).toBe(
      true,
    );
    expect(
      Result.isFailure(
        decode({
          ...base,
          clauses: [
            { kind: "property", pointer: "producer/name", operator: "equals", value: "agentxm" },
          ],
        }),
      ),
    ).toBe(true);
    expect(Result.isFailure(decode({ ...base, resultLimit: 101 }))).toBe(true);
  });

  it("publishes one decodable capability source for fields and operators", () => {
    expect(
      Result.isSuccess(
        Schema.decodeUnknownResult(KnowledgeDiscoveryCapabilitiesSchema)(
          KNOWLEDGE_DISCOVERY_CAPABILITIES,
        ),
      ),
    ).toBe(true);
    expect(KNOWLEDGE_DISCOVERY_CAPABILITIES.searchableFields).toEqual(KNOWLEDGE_SEARCHABLE_FIELDS);
    expect(KNOWLEDGE_DISCOVERY_CAPABILITIES.operators).toEqual(KNOWLEDGE_QUERY_OPERATORS);
    expect(KNOWLEDGE_DISCOVERY_CAPABILITIES.strategies).toEqual(["lexical"]);
  });
});

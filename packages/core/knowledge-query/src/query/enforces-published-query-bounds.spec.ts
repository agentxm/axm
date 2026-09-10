import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { defineSpecification } from "@agentxm/specification-metadata";

import { KNOWLEDGE_DISCOVERY_CAPABILITIES } from "../knowledge-capabilities.js";
import { makeKnowledgeQueryRequest } from "./request.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/query/enforces-published-query-bounds",
  title: "Query passage bounds follow the published discovery limits",
  statement:
    "When a Knowledge query selects passage bounds, AXM shall accept only whole-number passage limits from 0 through 10 and passage lengths from 1 through 2000.",
  class: "functional",
  role: "interface",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/core/knowledge-query/src/knowledge-capabilities.ts",
    "apps/cli/help/topics/knowledge.md",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Published passage limits", () => {
  it.effect("accepts the advertised whole-number endpoints and rejects bounds outside them", () =>
    Effect.gen(function* () {
      const limits = KNOWLEDGE_DISCOVERY_CAPABILITIES.limits;
      const maximumCount = limits.maximumPassagesPerResult;
      const maximumLength = limits.maximumPassageLength;
      expect(maximumCount).toBe(10);
      expect(maximumLength).toBe(2000);
      for (const bounds of [
        { passageLimit: -1 },
        { passageLimit: maximumCount + 1 },
        { passageLimit: 1.5 },
        { passageLength: 0 },
        { passageLength: maximumLength + 1 },
        { passageLength: 1.5 },
      ]) {
        const result = yield* Effect.result(
          makeKnowledgeQueryRequest({ scope: "project", ...bounds }),
        );
        expect(Result.isFailure(result) && result.failure._tag).toBe("KnowledgeRequestInvalid");
      }
      for (const bounds of [
        { passageLimit: 0, passageLength: 1 },
        { passageLimit: maximumCount, passageLength: maximumLength },
      ]) {
        const query = yield* makeKnowledgeQueryRequest({ scope: "project", ...bounds });
        expect(query).toMatchObject(bounds);
      }
    }),
  );
});

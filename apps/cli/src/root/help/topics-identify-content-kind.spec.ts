import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { rootCommand } from "../../app.js";
import { TestRenderer } from "../../test-support/presenter-test.js";
import { HelpIndexResultSchema, HelpTopicResultSchema, handleHelpPath } from "./command.js";

export const specification = defineSpecification({
  requirement: "cli/help/topics-identify-content-kind",
  title: "Machine topic help identifies text and structured JSON schemas",
  statement:
    "AXM topic discovery shall identify each topic's content kind, and topic results shall carry Markdown as text or a JSON Schema as an object discriminated by that kind.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "knowledge-access"],
  methods: ["model", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Machine topic content", () => {
  it.effect("every discovered topic returns the advertised representation", () =>
    Effect.gen(function* () {
      const renderer = TestRenderer.make();
      yield* handleHelpPath([], rootCommand).pipe(Effect.provide(renderer.layer));
      const index = yield* Schema.decodeUnknownEffect(HelpIndexResultSchema)(
        renderer.state.results[0]?.data,
      );
      expect(index.topics.length).toBeGreaterThan(0);
      expect(new Set(index.topics.map((topic) => topic.kind))).toEqual(
        new Set(["markdown", "json-schema"]),
      );
      for (const topic of index.topics) {
        const output = TestRenderer.make();
        yield* handleHelpPath([topic.name], rootCommand).pipe(Effect.provide(output.layer));
        const result = yield* Schema.decodeUnknownEffect(HelpTopicResultSchema)(
          output.state.results[0]?.data,
        );
        expect(result.topic).toBe(topic.name);
        expect(result.kind).toBe(topic.kind);
        if (result.kind === "markdown") {
          expect(result.content.length).toBeGreaterThan(0);
          expect(result).not.toHaveProperty("schema");
        } else {
          expect(result.schema).toHaveProperty("$schema");
          expect(result).not.toHaveProperty("content");
        }
      }
    }),
  );
});

import * as fs from "node:fs";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeDirectoryFixture } from "../../support/directory-harness.js";

export const specification = defineSpecification({
  requirement: "cli/help/lists-available-topics",
  title: "Help lists the available topics and how to read them",
  statement:
    "When invoked without a target, help shall list every bundled topic with a description and an invocation for reading a topic.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics"],
  boundary: "process",
  boundaryRationale:
    "The built CLI emits its topic index; an independent inventory of published Markdown and schema sources detects missing, duplicate, and extra entries.",
  methods: ["contract", "example"],
  derivedFrom: [
    "packages/cli/help/README.md",
    "packages/cli/src/root/help/command.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const indexDocument = Schema.Struct({
  ok: Schema.Literal(true),
  result: Schema.Struct({
    usage: Schema.String,
    topics: Schema.Array(Schema.Struct({ name: Schema.String, description: Schema.String })),
  }),
});
const cliRoot = new URL("../../../packages/cli/", import.meta.url);

describe("Help topic index", () => {
  it("lists the published topic inventory and supplies a working invocation", async () => {
    const fixture = makeDirectoryFixture();
    try {
      const result = await fixture.run(["help", "--json"]);
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      const index = Schema.decodeUnknownSync(indexDocument)(JSON.parse(result.stdout)).result;
      const markdown = fs
        .readdirSync(new URL("help/topics/", cliRoot))
        .filter((name) => name.endsWith(".md"))
        .map((name) => name.slice(0, -3));
      const schemas = fs
        .readdirSync(new URL("site-content/__generated__/schemas/", cliRoot))
        .filter((name) => name.endsWith(".schema.json"))
        .map((name) => `${name.slice(0, -".schema.json".length)}-schema`);
      const expected = [...markdown, ...schemas].sort();
      expect(expected.length).toBeGreaterThan(0);
      expect(index.topics.map((topic) => topic.name).sort()).toEqual(expected);
      for (const topic of index.topics)
        expect(topic.description.trim().length, topic.name).toBeGreaterThan(0);
      const invocation = index.usage.split(" ");
      expect(invocation.slice(0, 2)).toEqual(["axm", "help"]);
      expect(invocation).toHaveLength(3);
      expect(invocation[2]).toMatch(/^<[^>]+>$/);
      const read = await fixture.run([...invocation.slice(1, 2), "basic-usage", "--json"]);
      expect(read.exitCode, read.stdout + read.stderr).toBe(0);
      expect(JSON.parse(read.stdout)).toMatchObject({ ok: true, result: { topic: "basic-usage" } });
    } finally {
      fixture.cleanup();
    }
  });
});

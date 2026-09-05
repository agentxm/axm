import * as fs from "node:fs";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { HelpTopicResultSchema } from "axm.sh/specification-harness";
import { makeDirectoryFixture } from "../../support/directory-harness.js";

export const specification = defineSpecification({
  requirement: "cli/help/schema-topics-return-json",
  title: "Schema topics expose the published JSON schema",
  statement:
    "When a schema help topic is requested, AXM shall return the published schema as parseable JSON, directly in ordinary output and in the topic content field in machine output.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation"],
  boundary: "process",
  boundaryRationale:
    "Actual CLI output is decoded and compared with the published schema artifacts, detecting Markdown wrapping or unrelated schema content.",
  methods: ["contract", "decision-table"],
  derivedFrom: [
    "packages/cli/help/README.md",
    "packages/cli/src/root/help/command.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const topicDocument = Schema.Struct({ ok: Schema.Literal(true), result: HelpTopicResultSchema });
const schemaRoot = new URL(
  "../../../packages/cli/site-content/__generated__/schemas/",
  import.meta.url,
);
const schemas = fs.readdirSync(schemaRoot).filter((name) => name.endsWith(".schema.json"));

describe("Schema help topics", () => {
  it.each([false, true])(
    "returns each published schema with machine=%s",
    async (machine) => {
      const fixture = makeDirectoryFixture();
      try {
        expect(schemas.length).toBeGreaterThan(0);
        for (const schema of schemas) {
          const topic = `${schema.slice(0, -".schema.json".length)}-schema`;
          const result = await fixture.run(["help", topic, ...(machine ? ["--json"] : [])]);
          expect(result.exitCode, result.stdout + result.stderr).toBe(0);
          const content = machine
            ? Schema.decodeUnknownSync(topicDocument)(JSON.parse(result.stdout)).result.content
            : result.stdout;
          const actual: unknown = JSON.parse(content);
          const expected: unknown = JSON.parse(
            fs.readFileSync(new URL(schema, schemaRoot), "utf8"),
          );
          expect(actual, topic).toEqual(expected);
        }
      } finally {
        fixture.cleanup();
      }
    },
    60_000,
  );
});

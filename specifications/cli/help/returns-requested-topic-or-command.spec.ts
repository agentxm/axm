import * as fs from "node:fs";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { HelpTopicResultSchema, JsonErrorEnvelopeSchema } from "axm.sh/specification-harness";
import { makeDirectoryFixture } from "../../support/directory-harness.js";

export const specification = defineSpecification({
  requirement: "cli/help/returns-requested-topic-or-command",
  title: "Help returns the requested topic or command guidance",
  statement:
    "When help names a published topic or supported command path, AXM shall return that content or command help, and shall reject an unknown target with an invocation that lists available topics.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics"],
  boundary: "process",
  boundaryRationale:
    "Built CLI calls verify target parsing, published source content, equivalent nested command help, and execution of the recovery invocation.",
  methods: ["example", "decision-table"],
  derivedFrom: [
    "packages/cli/src/root/help/command.ts",
    "packages/cli/src/root/help/command.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Which target takes precedence when a single word names both a topic and a command? These examples do not establish that collision policy.",
  ],
});

const topicDocument = Schema.Struct({ ok: Schema.Literal(true), result: HelpTopicResultSchema });

describe("Help target selection", () => {
  it.each([false, true])(
    "returns the requested Markdown topic with machine=%s",
    async (machine) => {
      const fixture = makeDirectoryFixture();
      try {
        const result = await fixture.run([
          "help",
          "package-extensions",
          ...(machine ? ["--json"] : []),
        ]);
        expect(result.exitCode, result.stdout + result.stderr).toBe(0);
        // This marker-free source includes paragraphs, fenced examples, and a table.
        // Exact text preserves their whitespace without reproducing topic generation.
        const expected = fs.readFileSync(
          new URL("../../../packages/cli/help/topics/package-extensions.md", import.meta.url),
          "utf8",
        );
        if (machine) {
          const document = Schema.decodeUnknownSync(topicDocument)(JSON.parse(result.stdout));
          expect(document.result.topic).toBe("package-extensions");
          expect(document.result.content).toBe(expected);
        } else {
          // The shared process runner strips one final newline; paragraph and
          // fenced-content whitespace must otherwise remain exactly as authored.
          expect(result.stdout).toBe(expected.replace(/\n$/, ""));
        }
      } finally {
        fixture.cleanup();
      }
    },
  );

  it("returns the same nested command help as the command's help flag", async () => {
    const fixture = makeDirectoryFixture();
    try {
      const requested = await fixture.run(["help", "skills", "install", "--json"]);
      const direct = await fixture.run(["skills", "install", "--help", "--json"]);
      expect(requested.exitCode, requested.stdout + requested.stderr).toBe(0);
      expect(direct.exitCode, direct.stdout + direct.stderr).toBe(0);
      expect(JSON.parse(requested.stdout)).toEqual(JSON.parse(direct.stdout));
      expect(JSON.parse(requested.stdout)).toMatchObject({
        type: "help",
        usage: expect.stringContaining("skills install"),
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("offers executable topic discovery for an unknown target", async () => {
    const fixture = makeDirectoryFixture();
    try {
      const result = await fixture.run(["help", "unlisted-help-example", "--json"]);
      expect(result.exitCode).toBe(3);
      const failure = Schema.decodeUnknownSync(JsonErrorEnvelopeSchema)(JSON.parse(result.stdout));
      expect(failure.code).toBe("not_found");
      expect(failure.detail).toContain("unlisted-help-example");
      const recovery = failure.suggestions?.find((entry) => entry.cmd === "axm help");
      expect(recovery).toBeDefined();
      if (recovery?.cmd === undefined) throw new Error("Expected topic-list recovery");
      const listed = await fixture.run([...recovery.cmd.split(" ").slice(1), "--json"]);
      expect(listed.exitCode, listed.stdout + listed.stderr).toBe(0);
      expect(JSON.parse(listed.stdout)).toMatchObject({
        ok: true,
        result: {
          topics: expect.arrayContaining([expect.objectContaining({ name: "basic-usage" })]),
        },
      });
    } finally {
      fixture.cleanup();
    }
  });
});

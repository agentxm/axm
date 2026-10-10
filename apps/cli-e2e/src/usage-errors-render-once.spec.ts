import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { defineSpecification } from "@agentxm/specification-metadata";
import { makeOutputControlsFixture } from "./test-support/output-controls-harness.js";

export const specification = defineSpecification({
  requirement: "cli/usage-errors-render-once",
  title: "Usage failures show help followed by one error block",
  statement:
    "Human usage failures on diagnostics show, diagnostics export and token revoke shall print command help followed by exactly one Usage Error block and exit 2. Machine usage failures shall retain one structured failure document with code usage and exit 2.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "machine-automation"],
  boundary: "process",
  boundaryRationale:
    "Duplicate rendering is observable across the built process stdout and stderr boundaries.",
  methods: ["example"],
  derivedFrom: ["cli/command-help-is-complete"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const Failure = Schema.Struct({
  ok: Schema.Literal(false),
  code: Schema.Literal("usage"),
});
const decodeFailure = Schema.decodeUnknownSync(Schema.fromJsonString(Failure));

describe("Usage error rendering", () => {
  for (const command of [
    ["diagnostics", "show"],
    ["diagnostics", "export"],
    ["token", "revoke"],
  ]) {
    it.each(["text", "json"])(`${command.join(" ")} renders one %s failure`, async (format) => {
      const fixture = makeOutputControlsFixture();
      try {
        const result = await fixture.run([...command, ...(format === "json" ? ["--json"] : [])]);
        expect(result.exitCode, result.stdout + result.stderr).toBe(2);
        if (format === "json") {
          expect(decodeFailure(result.stdout)).toMatchObject({ ok: false, code: "usage" });
        } else {
          expect(result.stdout).toBe("");
          expect(result.stderr).toContain("USAGE");
          expect(result.stderr).toContain(`axm ${command.join(" ")}`);
          expect(result.stderr.indexOf("USAGE")).toBeLessThan(result.stderr.indexOf("Usage Error"));
          expect((result.stdout + result.stderr).match(/Usage Error/gu)).toHaveLength(1);
          expect(result.stderr).toContain("usage, exit 2");
        }
      } finally {
        fixture.cleanup();
      }
    });
  }
});

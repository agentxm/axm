import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { SkillFileAccessor, SkillRuleContext } from "../../context.js";
import { frontmatterStandardValidRule } from "./frontmatter-standard-valid.js";

const makeContext = (content: string, expectedName = "café-review"): SkillRuleContext => {
  const bytes = new TextEncoder().encode(content);
  const files: SkillFileAccessor = {
    exists: () => Effect.succeed(true),
    readBytes: () => Effect.succeed(bytes),
  };
  return {
    subject: { isNative: false, skillJson: undefined, expectedName },
    files,
    packageFiles: files,
    displayRoot: "",
  };
};

const check = (content: string, expectedName?: string) =>
  Effect.runPromise(frontmatterStandardValidRule.check(makeContext(content, expectedName)));

describe("frontmatterStandardValidRule", () => {
  it("accepts every standard field, Unicode names, and string metadata", async () => {
    const findings = await check(
      [
        "---",
        "name: café-review",
        "description: Reviews café content when localization work is requested.",
        "license: Apache-2.0",
        "compatibility: Requires git",
        "metadata:",
        '  author: "AgentXM"',
        '  version: "1"',
        "allowed-tools: Bash(git:*) Read",
        "---",
        "",
        "# Instructions",
      ].join("\n"),
    );
    expect(findings).toEqual([]);
  });

  it("rejects unknown fields, non-string metadata, and non-space-delimited tools", async () => {
    const findings = await check(
      [
        "---",
        "name: café-review",
        "description: Review content.",
        "invocable: true",
        "metadata:",
        "  version: 1",
        'allowed-tools: "Read  Bash(git:*)"',
        "---",
      ].join("\n"),
    );
    expect(findings.map((item) => item.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Unexpected frontmatter fields: invocable"),
        expect.stringContaining("Metadata value for 'version' must be a string"),
        expect.stringContaining("space-delimited"),
      ]),
    );
  });

  it("normalizes names with NFKC before comparing the directory", async () => {
    const decomposed = "cafe\u0301-review";
    const findings = await check(
      `---\nname: ${decomposed}\ndescription: Review content.\n---\n`,
      "café-review",
    );
    expect(findings).toEqual([]);
  });

  it("rejects consecutive hyphens and directory mismatches", async () => {
    const findings = await check(
      "---\nname: café--review\ndescription: Review content.\n---\n",
      "other-skill",
    );
    expect(findings.map((item) => item.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("consecutive hyphens"),
        expect.stringContaining("must match skill name"),
      ]),
    );
  });
});

/**
 * Unit tests for FQN parsing and formatting.
 */

import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { describe, expect, it } from "@effect/vitest";
import { extensionName, handle } from "../test-helpers.js";
import { formatFqn, parseFqn } from "./fqn.js";

describe("parseFqn", () => {
  [
    {
      input: "@acme/skills/code-review",
      expected: { owner: "@acme", type: "skill", name: "code-review" },
    },
    {
      input: "@acme/packs/fullstack",
      expected: { owner: "@acme", type: "pack", name: "fullstack" },
    },
    {
      input: "@acme/mcp-servers/database",
      expected: { owner: "@acme", type: "mcp-server", name: "database" },
    },
    {
      input: "@wayne_corp/skills/bat-signal",
      expected: { owner: "@wayne_corp", type: "skill", name: "bat-signal" },
    },
    {
      input: "@test123/packs/tool456",
      expected: { owner: "@test123", type: "pack", name: "tool456" },
    },
    {
      input: "@acme/commands/deploy",
      expected: { owner: "@acme", type: "command", name: "deploy" },
    },
    {
      input: "@acme/subagents/reviewer",
      expected: { owner: "@acme", type: "subagent", name: "reviewer" },
    },
    {
      input: "@acme/files/project-rules",
      expected: { owner: "@acme", type: "file", name: "project-rules" },
    },
    {
      input: "@acme/rules/review-checklist",
      expected: { owner: "@acme", type: "rule", name: "review-checklist" },
    },
  ].forEach(({ input, expected }) => {
    it(`parses valid FQN: ${input}`, () => {
      const result = parseFqn(input);
      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        expect(result.success).toEqual(expected);
      }
    });
  });

  [
    { input: "@acme/code-review", desc: "2-segment name" },
    { input: "acme/skills/code-review", desc: "missing @ prefix" },
    { input: "code-review", desc: "bare name" },
    { input: "@acme/widgets/foo", desc: "invalid type segment" },
    { input: "@acme/skill/foo", desc: "singular type (not plural)" },
    { input: "@acme/skills/code_review", desc: "name with underscore" },
    { input: "", desc: "empty string" },
    { input: "@acme/skills/", desc: "trailing slash, no name" },
    { input: "@acme//code-review", desc: "missing type segment" },
    { input: "@/skills/code-review", desc: "empty handle" },
  ].forEach(({ input, desc }) => {
    it(`rejects invalid input: ${desc} (${input})`, () => {
      const result = parseFqn(input);
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure._tag).toBe("FqnInvalidError");
        expect(result.failure.input).toBe(input);
      }
    });
  });
});

describe("formatFqn", () => {
  it("formats Fqn to string", () => {
    const result = formatFqn({
      owner: handle("@acme"),
      type: "skill",
      name: extensionName("code-review"),
    });

    expect(result).toBe("@acme/skills/code-review");
  });

  it("formats all type segments correctly", () => {
    expect(formatFqn({ owner: handle("@x"), type: "pack", name: extensionName("y") })).toBe(
      "@x/packs/y",
    );
    expect(formatFqn({ owner: handle("@x"), type: "command", name: extensionName("y") })).toBe(
      "@x/commands/y",
    );
    expect(formatFqn({ owner: handle("@x"), type: "mcp-server", name: extensionName("y") })).toBe(
      "@x/mcp-servers/y",
    );
    expect(formatFqn({ owner: handle("@x"), type: "subagent", name: extensionName("y") })).toBe(
      "@x/subagents/y",
    );
    expect(formatFqn({ owner: handle("@x"), type: "file", name: extensionName("y") })).toBe(
      "@x/files/y",
    );
    expect(formatFqn({ owner: handle("@x"), type: "rule", name: extensionName("y") })).toBe(
      "@x/rules/y",
    );
  });
});

describe("round-trip", () => {
  [
    "@acme/skills/code-review",
    "@acme/packs/fullstack",
    "@acme/commands/deploy",
    "@acme/mcp-servers/database",
    "@acme/subagents/reviewer",
    "@acme/files/project-rules",
    "@acme/rules/review-checklist",
  ].forEach((input) => {
    it.effect(`formatFqn(parseFqn(${input})) === ${input}`, () =>
      Effect.gen(function* () {
        const parsed = yield* parseFqn(input);
        expect(formatFqn(parsed)).toBe(input);
      }),
    );
  });
});

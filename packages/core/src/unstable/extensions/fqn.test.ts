/**
 * Unit tests for FQN parsing and formatting.
 */

import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { describe, expect, it } from "@effect/vitest";
import { formatFqn, parseFqn, parseFqnOrThrow } from "./fqn.js";

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
    it.effect(`parses valid FQN: ${input}`, () =>
      Effect.gen(function* () {
        const result = yield* parseFqn(input);
        expect(result).toEqual(expected);
      }),
    );
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
    it.effect(`rejects invalid input: ${desc} (${input})`, () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(parseFqn(input));
        expect(Exit.isFailure(exit)).toBe(true);
      }),
    );
  });
});

describe("parseFqnOrThrow", () => {
  it("returns parsed Fqn for valid input", () => {
    const result = parseFqnOrThrow("@acme/skills/code-review");

    expect(result).toEqual({ owner: "@acme", type: "skill", name: "code-review" });
  });

  it("throws for invalid input", () => {
    expect(() => parseFqnOrThrow("@acme/code-review")).toThrow("Invalid fully qualified name");
  });

  it("throws for bare name", () => {
    expect(() => parseFqnOrThrow("code-review")).toThrow("Invalid fully qualified name");
  });
});

describe("formatFqn", () => {
  it("formats Fqn to string", () => {
    const result = formatFqn({ owner: "@acme", type: "skill", name: "code-review" });

    expect(result).toBe("@acme/skills/code-review");
  });

  it("formats all type segments correctly", () => {
    expect(formatFqn({ owner: "@x", type: "pack", name: "y" })).toBe("@x/packs/y");
    expect(formatFqn({ owner: "@x", type: "command", name: "y" })).toBe("@x/commands/y");
    expect(formatFqn({ owner: "@x", type: "mcp-server", name: "y" })).toBe("@x/mcp-servers/y");
    expect(formatFqn({ owner: "@x", type: "subagent", name: "y" })).toBe("@x/subagents/y");
    expect(formatFqn({ owner: "@x", type: "file", name: "y" })).toBe("@x/files/y");
    expect(formatFqn({ owner: "@x", type: "rule", name: "y" })).toBe("@x/rules/y");
  });
});

describe("round-trip", () => {
  it.each([
    "@acme/skills/code-review",
    "@acme/packs/fullstack",
    "@acme/commands/deploy",
    "@acme/mcp-servers/database",
    "@acme/subagents/reviewer",
    "@acme/files/project-rules",
    "@acme/rules/review-checklist",
  ])("formatFqn(parseFqnOrThrow(%s)) === %s", (input) => {
    expect(formatFqn(parseFqnOrThrow(input))).toBe(input);
  });
});

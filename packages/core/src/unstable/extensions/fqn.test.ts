/**
 * Unit tests for FQN parsing and formatting.
 */

import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as FastCheck from "effect/testing/FastCheck";
import { describe, expect, it } from "@effect/vitest";
import { extensionName, handle } from "../test-helpers.js";
import { ExtensionNameSchema, ExtensionTypeSchema } from "./common.js";
import { formatFqn, parseFqn } from "./fqn.js";
import { HandleSchema } from "./handle.js";

const handleArbitrary = FastCheck.tuple(
  FastCheck.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789_"),
  FastCheck.array(FastCheck.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789_-"), {
    maxLength: 20,
  }),
).map(([first, rest]) =>
  Schema.decodeUnknownSync(HandleSchema)(`@${first}${rest.join("").replace(/-+$/, "")}`),
);
const nameArbitrary = FastCheck.tuple(
  FastCheck.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789"),
  FastCheck.array(FastCheck.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-"), {
    maxLength: 20,
  }),
).map(([first, rest]) =>
  Schema.decodeUnknownSync(ExtensionNameSchema)(`${first}${rest.join("").replace(/-+$/, "")}`),
);
const typeArbitrary = FastCheck.constantFrom(
  "skill",
  "mcp-server",
  "subagent",
  "rule",
  "hook",
  "knowledge",
  "pack",
).map(Schema.decodeUnknownSync(ExtensionTypeSchema));

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
      input: "@acme/mcps/database",
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
      input: "@acme/subagents/reviewer",
      expected: { owner: "@acme", type: "subagent", name: "reviewer" },
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
    expect(formatFqn({ owner: handle("@x"), type: "mcp-server", name: extensionName("y") })).toBe(
      "@x/mcps/y",
    );
    expect(formatFqn({ owner: handle("@x"), type: "subagent", name: extensionName("y") })).toBe(
      "@x/subagents/y",
    );
    expect(formatFqn({ owner: handle("@x"), type: "rule", name: extensionName("y") })).toBe(
      "@x/rules/y",
    );
  });
});

describe("round-trip", () => {
  it.prop(
    "parses every generated canonical FQN after formatting",
    { owner: handleArbitrary, type: typeArbitrary, name: nameArbitrary },
    ({ owner, type, name }) => {
      const parts = { owner, type, name };
      const formatted = formatFqn(parts);
      const parsed = parseFqn(formatted);
      expect(Result.isSuccess(parsed)).toBe(true);
      if (Result.isSuccess(parsed)) expect(parsed.success).toEqual(parts);
    },
    { fastCheck: { numRuns: 500, seed: 0x41584d } },
  );

  [
    "@acme/skills/code-review",
    "@acme/packs/fullstack",
    "@acme/mcps/database",
    "@acme/subagents/reviewer",
    "@acme/rules/review-checklist",
  ].forEach((input) => {
    it.effect(`formatFqn(parseFqn(${input})) === ${input}`, () =>
      Effect.gen(function* () {
        const parsed = yield* Effect.fromResult(parseFqn(input));
        expect(formatFqn(parsed)).toBe(input);
      }),
    );
  });
});

/**
 * Unit tests for FQN parsing and formatting.
 */

import * as Effect from "effect/Effect";
import * as Either from "effect/Either";
import { describe, expect, it } from "vitest";
import { formatFqn, parseFqn, parseFqnOrThrow } from "./fqn.js";

const runSync = <A>(effect: Effect.Effect<A, unknown>) =>
  Effect.runSyncExit(effect).pipe((exit) =>
    exit._tag === "Success" ? Either.right(exit.value) : Either.left(exit.cause),
  );

describe("parseFqn", () => {
  it.each([
    {
      input: "@acme/skills/code-review",
      expected: { namespace: "@acme", type: "skills", name: "code-review" },
    },
    {
      input: "@acme/packs/fullstack",
      expected: { namespace: "@acme", type: "packs", name: "fullstack" },
    },
    {
      input: "@acme/mcp-servers/database",
      expected: { namespace: "@acme", type: "mcp-servers", name: "database" },
    },
    {
      input: "@wayne_corp/skills/bat_signal",
      expected: { namespace: "@wayne_corp", type: "skills", name: "bat_signal" },
    },
    {
      input: "@test123/packs/tool456",
      expected: { namespace: "@test123", type: "packs", name: "tool456" },
    },
    {
      input: "@acme/commands/deploy",
      expected: { namespace: "@acme", type: "commands", name: "deploy" },
    },
  ])("parses valid FQN: $input", ({ input, expected }) => {
    const result = runSync(parseFqn(input));

    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right).toEqual(expected);
    }
  });

  it.each([
    { input: "@acme/code-review", desc: "2-segment name" },
    { input: "acme/skills/code-review", desc: "missing @ prefix" },
    { input: "code-review", desc: "bare name" },
    { input: "@acme/widgets/foo", desc: "invalid type segment" },
    { input: "@acme/skill/foo", desc: "singular type (not plural)" },
    { input: "", desc: "empty string" },
    { input: "@acme/skills/", desc: "trailing slash, no name" },
    { input: "@acme//code-review", desc: "missing type segment" },
    { input: "@/skills/code-review", desc: "empty namespace" },
  ])("rejects invalid input: $desc ($input)", ({ input }) => {
    const result = runSync(parseFqn(input));

    expect(Either.isLeft(result)).toBe(true);
  });
});

describe("parseFqnOrThrow", () => {
  it("returns parsed Fqn for valid input", () => {
    const result = parseFqnOrThrow("@acme/skills/code-review");

    expect(result).toEqual({ namespace: "@acme", type: "skills", name: "code-review" });
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
    const result = formatFqn({ namespace: "@acme", type: "skills", name: "code-review" });

    expect(result).toBe("@acme/skills/code-review");
  });

  it("formats all type segments correctly", () => {
    expect(formatFqn({ namespace: "@x", type: "packs", name: "y" })).toBe("@x/packs/y");
    expect(formatFqn({ namespace: "@x", type: "commands", name: "y" })).toBe("@x/commands/y");
    expect(formatFqn({ namespace: "@x", type: "mcp-servers", name: "y" })).toBe("@x/mcp-servers/y");
  });
});

describe("round-trip", () => {
  it.each([
    "@acme/skills/code-review",
    "@acme/packs/fullstack",
    "@acme/commands/deploy",
    "@acme/mcp-servers/database",
  ])("formatFqn(parseFqnOrThrow(%s)) === %s", (input) => {
    expect(formatFqn(parseFqnOrThrow(input))).toBe(input);
  });
});

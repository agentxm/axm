import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { extensionName, handle } from "../test-helpers.js";
import { matchesReleaseAgeExcludePattern, ReleaseAgeExcludePatternSchema } from "./fqn-pattern.js";

const decode = Schema.decodeUnknownSync(ReleaseAgeExcludePatternSchema);

describe("ReleaseAgeExcludePatternSchema", () => {
  it.each([
    ["@acme/skills/code-review", { owner: "@acme", type: "skill", name: "code-review" }],
    ["@acme/skills/*", { owner: "@acme", type: "skill", name: "*" }],
    ["@acme/*", { owner: "@acme", type: "*", name: "*" }],
  ])("decodes %s", (input, expected) => {
    expect(decode(input)).toEqual(expected);
  });

  it.each([
    "*",
    "*/skills/code-review",
    "@acme/*/code-review",
    "@acme/skills/code-*",
    "@acme/widgets/*",
    "@acme/skills",
    "https://example.com/skill.md",
  ])("rejects %s with the legal forms", (input) => {
    expect(() => decode(input)).toThrow(
      "Expected @owner/<type>s/name, @owner/<type>s/*, or @owner/*",
    );
  });

  it("round-trips every legal form", () => {
    const encode = Schema.encodeSync(ReleaseAgeExcludePatternSchema);
    for (const input of ["@acme/skills/code-review", "@acme/skills/*", "@acme/*"]) {
      expect(encode(decode(input))).toBe(input);
    }
  });
});

describe("matchesReleaseAgeExcludePattern", () => {
  const skill = {
    owner: handle("@acme"),
    type: "skill",
    name: extensionName("code-review"),
  } as const;

  it("matches exact, type, and owner patterns by whole segments", () => {
    expect(matchesReleaseAgeExcludePattern(decode("@acme/skills/code-review"), skill)).toBe(true);
    expect(matchesReleaseAgeExcludePattern(decode("@acme/skills/*"), skill)).toBe(true);
    expect(matchesReleaseAgeExcludePattern(decode("@acme/*"), skill)).toBe(true);
  });

  it("does not cross owner, type, or name boundaries", () => {
    expect(matchesReleaseAgeExcludePattern(decode("@other/*"), skill)).toBe(false);
    expect(matchesReleaseAgeExcludePattern(decode("@acme/rules/*"), skill)).toBe(false);
    expect(matchesReleaseAgeExcludePattern(decode("@acme/skills/other"), skill)).toBe(false);
  });

  it("lets an owner pattern match packs and skills", () => {
    const pattern = decode("@acme/*");
    expect(matchesReleaseAgeExcludePattern(pattern, skill)).toBe(true);
    expect(
      matchesReleaseAgeExcludePattern(pattern, {
        owner: handle("@acme"),
        type: "pack",
        name: extensionName("toolkit"),
      }),
    ).toBe(true);
  });
});

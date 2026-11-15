import * as Result from "effect/Result";
import { describe, expect, it } from "@effect/vitest";

import { parseReleaseReference } from "../index.js";

describe("Exact release references", () => {
  it("decodes an exact reference with its singular type and canonical id", () => {
    const parsed = parseReleaseReference("@acme/packs/engineering@2.0.0-beta.1");
    expect(Result.isSuccess(parsed) ? parsed.success : parsed.failure).toEqual({
      input: "@acme/packs/engineering@2.0.0-beta.1",
      id: "@acme/packs/engineering@2.0.0-beta.1",
      owner: "@acme",
      type: "pack",
      name: "engineering",
      version: "2.0.0-beta.1",
    });
  });

  it.each([
    ["@acme/skills/review", "missing-version"],
    ["@acme/skills/review@", "inexact-version"],
    ["@acme/skills/review@^1.0.0", "inexact-version"],
    ["@acme/skills/review@latest", "inexact-version"],
    ["review@1.0.0", "invalid-name"],
    ["review", "invalid-name"],
    ["@acme/widgets/review@1.0.0", "invalid-name"],
    ["@acme/skill/review@1.0.0", "invalid-name"],
  ])("refuses %s as %s, naming the input", (input, reason) => {
    const parsed = parseReleaseReference(input);
    expect(Result.isFailure(parsed)).toBe(true);
    if (Result.isFailure(parsed)) {
      expect(parsed.failure.reason).toBe(reason);
      expect(parsed.failure.input).toBe(input);
      expect(parsed.failure.detail).toContain(input);
    }
  });
});

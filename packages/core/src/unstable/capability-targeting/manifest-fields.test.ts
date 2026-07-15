import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { SkillManifestSchema } from "../skills/manifest-schema.js";

describe("capability targeting manifest fields", () => {
  const base = {
    owner: "@acme",
    type: "skill",
    name: "review",
    version: "1.0.0",
  } as const;

  it("accepts soft enhancements, hard requirements, and explicit fallback policy", () => {
    const decoded = Schema.decodeUnknownSync(SkillManifestSchema)({
      ...base,
      enhances: ["subagents", "structured-input:native"],
      requires: ["mcp-servers"],
      fallback: "none",
    });

    expect(decoded.enhances).toEqual(["subagents", "structured-input:native"]);
    expect(decoded.requires).toEqual(["mcp-servers"]);
    expect(decoded.fallback).toBe("none");
  });

  it("rejects malformed capability keys", () => {
    expect(() =>
      Schema.decodeUnknownSync(SkillManifestSchema)({
        ...base,
        enhances: ["Sub Agents"],
      }),
    ).toThrow();
  });
});

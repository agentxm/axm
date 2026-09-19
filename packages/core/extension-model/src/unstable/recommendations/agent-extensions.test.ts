import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import {
  AgentExtensionRecommendationSchema,
  AgentExtensionsMetadataSchema,
} from "./agent-extensions.js";

describe("AgentExtensionsMetadataSchema", () => {
  const decode = Schema.decodeUnknownResult(AgentExtensionsMetadataSchema);

  it("accepts sourceless, Registry, Git, and path recommendations", () => {
    const result = decode({
      agentExtensions: [
        { ref: "@acme/skills/defaulted", versionRange: "^1.0.0" },
        {
          ref: "@acme/packs/registry",
          source: { type: "registry", url: "https://registry.example.test" },
          versionRange: ">=2.0.0 <3.0.0",
        },
        {
          ref: "@acme/rules/git",
          source: {
            type: "git",
            url: "https://github.com/acme/extensions.git",
            path: "rules/git",
            revision: "v2.0.0",
          },
        },
        {
          ref: "@acme/knowledge/local",
          source: { type: "path", path: "../agent-extensions/knowledge/local" },
        },
      ],
    });

    expect(Result.isSuccess(result)).toBe(true);
  });

  it("rejects the former axm.extensions shape", () => {
    expect(
      Result.isFailure(decode({ axm: { extensions: [{ ref: "@acme/skills/code-review" }] } })),
    ).toBe(true);
  });

  it("rejects versionRange for non-Registry sources", () => {
    const decodeEntry = Schema.decodeUnknownResult(AgentExtensionRecommendationSchema);

    for (const source of [
      { type: "git", url: "https://github.com/acme/extensions.git" },
      { type: "path", path: "../extensions" },
    ]) {
      expect(
        Result.isFailure(
          decodeEntry({ ref: "@acme/skills/code-review", source, versionRange: "^1.0.0" }),
        ),
      ).toBe(true);
    }
  });

  it("rejects null in optional contract fields", () => {
    const decodeEntry = Schema.decodeUnknownResult(AgentExtensionRecommendationSchema);

    expect(
      Result.isFailure(decodeEntry({ ref: "@acme/skills/code-review", versionRange: null })),
    ).toBe(true);
    expect(
      Result.isFailure(
        decodeEntry({
          ref: "@acme/skills/code-review",
          source: { type: "git", url: "https://github.com/acme/extensions.git", path: null },
        }),
      ),
    ).toBe(true);
  });
});

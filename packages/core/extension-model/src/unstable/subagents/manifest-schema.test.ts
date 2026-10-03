import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { SubagentManifestSchema } from "./manifest-schema.js";

describe("SubagentManifestSchema", () => {
  const decode = Schema.decodeUnknownSync(SubagentManifestSchema);
  const identity = { owner: "@wayne", type: "subagent", name: "case-solver", version: "1.0.0" };

  it("accepts a portable core", () => {
    const result = decode({
      ...identity,
      description: "Solves cases",
      core: { instructions: "src/instructions.md" },
    });
    expect(result.name).toBe("case-solver");
    expect(result.core?.instructions).toBe("src/instructions.md");
  });

  it.each(["fallback", "agentOverrides", "agents"])(
    "rejects the obsolete %s field even without strict decoding",
    (field) => {
      expect(() =>
        decode({
          ...identity,
          description: "Solves cases",
          core: { instructions: "src/instructions.md" },
          [field]: field === "fallback" ? "auto" : {},
        }),
      ).toThrow();
    },
  );

  it("rejects native and customized fields combined in one slot with the default decoder", () => {
    expect(() =>
      decode({
        ...identity,
        implementations: {
          codex: {
            kind: "native",
            source: "native/review.toml",
            configuration: { model: "override" },
          },
        },
      }),
    ).toThrow();
  });
});

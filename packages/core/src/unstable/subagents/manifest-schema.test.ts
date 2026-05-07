import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { SubagentManifestSchema } from "./manifest-schema.js";

describe("SubagentManifestSchema", () => {
  const decode = Schema.decodeUnknownSync(SubagentManifestSchema);

  it("accepts valid minimal manifest", () => {
    const input = {
      owner: "@wayne",
      type: "subagent",
      name: "case-solver",
      version: "1.0.0",
    };
    const result = decode(input);
    expect(result.owner).toBe("@wayne");
    expect(result.type).toBe("subagent");
    expect(result.name).toBe("case-solver");
    expect(result.version).toBe("1.0.0");
  });

  it("ignores residual agents field while decoding older manifests", () => {
    const input = {
      owner: "@wayne",
      type: "subagent",
      name: "case-solver",
      version: "1.0.0",
      agents: ["claude-code"],
    };
    const result = decode(input);
    expect("agents" in result).toBe(false);
  });
});

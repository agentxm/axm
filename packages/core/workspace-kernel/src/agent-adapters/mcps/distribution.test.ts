import { describe, expect, it } from "@effect/vitest";
import { mcpRunner } from "./distribution.js";

describe("OCI image locators", () => {
  it.each([
    ["localhost:5000/tool", "localhost:5000/tool:1.2.3"],
    ["localhost:5000/tool:1.2.3", "localhost:5000/tool:1.2.3"],
    [`${":".repeat(20_000)}/tool`, `${":".repeat(20_000)}/tool:1.2.3`],
  ])("keeps registry authority separate from the image version", (identifier, image) => {
    const result = mcpRunner({
      registryType: "oci",
      identifier,
      version: "1.2.3",
      transport: { type: "stdio" },
    });
    expect(result).toMatchObject({ _tag: "supported", afterRuntime: [image] });
  });
});

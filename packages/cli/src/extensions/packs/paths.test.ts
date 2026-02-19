import { describe, expect, it } from "vitest";
import { computePackPaths } from "./paths.js";

const join = (...parts: string[]) => parts.join("/");
const base = "/workspace";

describe("computePackPaths", () => {
  it("produces registry extensions path with namespace", () => {
    const result = computePackPaths(join, base, "@acme", "my-pack");

    expect(result.canonicalPath).toBe("/workspace/.axm/extensions/@acme/packs/my-pack");
  });

  it("handles different namespaces correctly", () => {
    const result = computePackPaths(join, base, "@community", "starter-pack");

    expect(result.canonicalPath).toBe("/workspace/.axm/extensions/@community/packs/starter-pack");
  });

  it("handles hyphenated pack names", () => {
    const result = computePackPaths(join, base, "@corp", "code-quality-pack");

    expect(result.canonicalPath).toBe("/workspace/.axm/extensions/@corp/packs/code-quality-pack");
  });
});

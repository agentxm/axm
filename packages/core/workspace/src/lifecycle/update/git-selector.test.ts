import { describe, expect, it } from "vitest";

import { assessGitSelector } from "./git-selector.js";

describe("Git update selectors", () => {
  const remote = {
    branches: ["main", "release"],
    tags: ["v1.0.0", "v1.4.0", "v2.0.0", "preview"],
  };

  it("advances advertised branches", () => {
    expect(assessGitSelector("main", remote)).toEqual({ kind: "branch" });
  });

  it("holds tags and reports the newest later semantic tag", () => {
    expect(assessGitSelector("v1.0.0", remote)).toEqual({
      kind: "tag",
      newerTag: "v2.0.0",
    });
  });

  it("holds commit selectors", () => {
    expect(assessGitSelector("0123456789012345678901234567890123456789", remote)).toEqual({
      kind: "commit",
    });
  });

  it("leaves an unadvertised symbolic selector for normal resolution to reject", () => {
    expect(assessGitSelector("deleted-branch", remote)).toEqual({ kind: "unknown" });
  });

  it("holds non-semantic tags without inventing an ordering", () => {
    expect(assessGitSelector("preview", remote)).toEqual({ kind: "tag" });
  });
});

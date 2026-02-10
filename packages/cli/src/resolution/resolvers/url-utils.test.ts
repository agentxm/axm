import { describe, expect, it } from "vitest";
import { buildOriginUrl } from "./url-utils.js";

describe("buildOriginUrl", () => {
  it("builds GitHub URL", () => {
    expect(buildOriginUrl("github", "owner", "repo")).toBe("https://github.com/owner/repo");
  });

  it("builds GitLab URL", () => {
    expect(buildOriginUrl("gitlab", "owner", "repo")).toBe("https://gitlab.com/owner/repo");
  });

  it("builds Bitbucket URL", () => {
    expect(buildOriginUrl("bitbucket", "owner", "repo")).toBe("https://bitbucket.org/owner/repo");
  });

  it("builds Azure DevOps URL", () => {
    expect(buildOriginUrl("azure", "org", "repo")).toBe("https://dev.azure.com/org/repo");
  });
});

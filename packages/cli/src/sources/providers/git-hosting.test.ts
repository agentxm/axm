/**
 * Tests for git hosting source providers (GitHub, GitLab, Bitbucket).
 *
 * Verifies provider creation and type discriminator.
 * Deep integration testing (clone + discover) is covered by E2E tests.
 */

import { describe, expect, it } from "vitest";
import {
  createBitbucketProvider,
  createGitHubProvider,
  createGitLabProvider,
} from "./git-hosting.js";

describe("createGitHubProvider", () => {
  it("has type 'github'", () => {
    const provider = createGitHubProvider();
    expect(provider.type).toBe("github");
  });
});

describe("createGitLabProvider", () => {
  it("has type 'gitlab'", () => {
    const provider = createGitLabProvider();
    expect(provider.type).toBe("gitlab");
  });
});

describe("createBitbucketProvider", () => {
  it("has type 'bitbucket'", () => {
    const provider = createBitbucketProvider();
    expect(provider.type).toBe("bitbucket");
  });
});

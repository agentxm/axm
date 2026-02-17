/**
 * Tests for git hosting source providers (GitHub, GitLab, Bitbucket).
 *
 * Verifies provider creation and type discriminator.
 * Deep integration testing (clone + discover) is covered by E2E tests.
 */

import * as NodeContext from "@effect/platform-node/NodeContext";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { describe, expect, it } from "vitest";
import {
  createGitHubSourceHostProvider,
  createGitLabSourceHostProvider,
  createBitbucketSourceHostProvider,
  createAzureReposSourceHostProvider,
} from "./git-hosting.js";

/** Run an effect with the required context for SourceHostProvider operations. */
const runMatch = (effect: Effect.Effect<boolean, unknown, unknown>) =>
  Effect.runSync(
    effect.pipe(Effect.provide(NodeContext.layer), Effect.provide(Layer.empty)) as Effect.Effect<
      boolean,
      unknown,
      never
    >,
  );

describe("createGitHubSourceHostProvider", () => {
  const host = { type: "github" as const, url: new URL("https://github.com") };
  const provider = createGitHubSourceHostProvider(host);

  it("has type 'github'", () => {
    expect(provider.type).toBe("github");
  });

  it("match returns true for matching hostname", () => {
    expect(runMatch(provider.match(new URL("https://github.com/owner/repo")))).toBe(true);
  });

  it("match returns false for non-matching hostname", () => {
    expect(runMatch(provider.match(new URL("https://gitlab.com/owner/repo")))).toBe(false);
  });

  it("match works with GHE instances", () => {
    const gheHost = { type: "github" as const, url: new URL("https://github.mycompany.com") };
    const gheProvider = createGitHubSourceHostProvider(gheHost);
    expect(runMatch(gheProvider.match(new URL("https://github.mycompany.com/owner/repo")))).toBe(
      true,
    );
  });
});

describe("createGitLabSourceHostProvider", () => {
  const host = { type: "gitlab" as const, url: new URL("https://gitlab.com") };
  const provider = createGitLabSourceHostProvider(host);

  it("has type 'gitlab'", () => {
    expect(provider.type).toBe("gitlab");
  });

  it("match returns true for matching hostname", () => {
    expect(runMatch(provider.match(new URL("https://gitlab.com/group/repo")))).toBe(true);
  });

  it("match returns false for non-matching hostname", () => {
    expect(runMatch(provider.match(new URL("https://github.com/owner/repo")))).toBe(false);
  });
});

describe("createBitbucketSourceHostProvider", () => {
  const host = { type: "bitbucket" as const, url: new URL("https://bitbucket.org") };
  const provider = createBitbucketSourceHostProvider(host);

  it("has type 'bitbucket'", () => {
    expect(provider.type).toBe("bitbucket");
  });

  it("match returns true for matching hostname", () => {
    expect(runMatch(provider.match(new URL("https://bitbucket.org/team/repo")))).toBe(true);
  });

  it("match returns false for non-matching hostname", () => {
    expect(runMatch(provider.match(new URL("https://github.com/owner/repo")))).toBe(false);
  });
});

describe("createAzureReposSourceHostProvider", () => {
  const host = { type: "azurerepos" as const, url: new URL("https://dev.azure.com") };
  const provider = createAzureReposSourceHostProvider(host);

  it("has type 'azurerepos'", () => {
    expect(provider.type).toBe("azurerepos");
  });

  it("match returns true for matching hostname", () => {
    expect(runMatch(provider.match(new URL("https://dev.azure.com/org/project/_git/repo")))).toBe(
      true,
    );
  });

  it("match returns false for non-matching hostname", () => {
    expect(runMatch(provider.match(new URL("https://github.com/owner/repo")))).toBe(false);
  });
});

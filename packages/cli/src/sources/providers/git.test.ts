/**
 * Tests for generic git source provider stub.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import { createGitSourceHostProvider } from "./git.js";

describe("createGitSourceHostProvider", () => {
  const provider = createGitSourceHostProvider();

  it("has type 'git'", () => {
    expect(provider.type).toBe("git");
  });

  it("match returns true for git:// scheme", () => {
    const result = Effect.runSync(provider.match(new URL("git://example.com/repo.git")));
    expect(result).toBe(true);
  });

  it("match returns true for ssh:// scheme", () => {
    const result = Effect.runSync(provider.match(new URL("ssh://git@example.com/repo.git")));
    expect(result).toBe(true);
  });

  it("match returns false for https:// scheme", () => {
    const result = Effect.runSync(provider.match(new URL("https://example.com/repo.git")));
    expect(result).toBe(false);
  });

  it("match returns false for file:// scheme", () => {
    const result = Effect.runSync(provider.match(new URL("file:///path/to/repo")));
    expect(result).toBe(false);
  });

  it("find fails with not-yet-supported error", () => {
    const result = Effect.runSync(
      provider
        .find(
          { type: "git", url: new URL("git://example.com/repo.git"), ref: Option.none() },
          {
            skillNames: [],
            type: "skill",
            namespace: Option.none(),
            versionConstraint: Option.none(),
          },
        )
        .pipe(Effect.either),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.what).toContain("not yet supported");
    }
  });
});

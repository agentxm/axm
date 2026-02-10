/**
 * Tests for generic git source provider stub.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import { createGitProvider } from "./git.js";

describe("createGitProvider", () => {
  it("has type 'git'", () => {
    const provider = createGitProvider();
    expect(provider.type).toBe("git");
  });

  it("find fails with not-yet-supported error", () => {
    const provider = createGitProvider();
    const result = Effect.runSync(
      provider
        .find(
          { source: "git", url: new URL("https://example.com/repo.git"), ref: Option.none() },
          { names: [], agents: [], type: "skill" },
        )
        .pipe(Effect.either),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.message).toContain("not yet supported");
    }
  });

  it("fetch fails with not-yet-supported error", () => {
    const provider = createGitProvider();
    const result = Effect.runSync(
      provider
        .fetch(
          { source: "git", url: new URL("https://example.com/repo.git"), ref: Option.none() },
          {
            type: "skill",
            skill: { name: "x", description: "", metadata: Option.none() },
            source: {
              source: "git",
              url: new URL("https://example.com/repo.git"),
              ref: Option.none(),
            },
            location: "file:///tmp/x",
            version: Option.none(),
            gitTreeSha: Option.none(),
          },
        )
        .pipe(Effect.either),
    );
    expect(result._tag).toBe("Left");
  });
});

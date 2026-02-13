/**
 * Tests for Azure Repos source provider stub.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import { createAzureReposProvider } from "./azurerepos.js";

describe("createAzureReposProvider", () => {
  it("has type 'azurerepos'", () => {
    const provider = createAzureReposProvider();
    expect(provider.type).toBe("azurerepos");
  });

  it("find fails with not-yet-supported error", () => {
    const provider = createAzureReposProvider();
    const result = Effect.runSync(
      provider
        .find(
          {
            type: "azurerepos",
            organization: "org",
            project: "proj",
            repo: "repo",
            ref: Option.none(),
            subPath: Option.none(),
          },
          { names: [], agents: [], type: "skill" },
        )
        .pipe(Effect.either),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.what).toContain("not yet supported");
    }
  });

  it("fetch fails with not-yet-supported error", () => {
    const provider = createAzureReposProvider();
    const result = Effect.runSync(
      provider
        .fetch(
          {
            type: "azurerepos",
            organization: "org",
            project: "proj",
            repo: "repo",
            ref: Option.none(),
            subPath: Option.none(),
          },
          {
            type: "skill",
            skill: { name: "x", description: "", metadata: Option.none() },
            source: {
              type: "azurerepos",
              organization: "org",
              project: "proj",
              repo: "repo",
              ref: Option.none(),
              subPath: Option.none(),
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

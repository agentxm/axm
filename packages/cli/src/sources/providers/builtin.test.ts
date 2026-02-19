/**
 * Tests for builtin source host provider.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import { createBuiltinSourceHostProvider } from "./builtin.js";

describe("createBuiltinSourceHostProvider", () => {
  it("has type 'builtin'", () => {
    const provider = createBuiltinSourceHostProvider();
    expect(provider.type).toBe("builtin");
  });

  it("match always returns false", () => {
    const provider = createBuiltinSourceHostProvider();
    const result = Effect.runSync(provider.match(new URL("https://example.com")));
    expect(result).toBe(false);
  });

  it("match returns false for any URL scheme", () => {
    const provider = createBuiltinSourceHostProvider();

    const urls = [
      new URL("https://github.com/owner/repo"),
      new URL("file:///path/to/dir"),
      new URL("git://example.com/repo.git"),
    ];

    for (const url of urls) {
      const result = Effect.runSync(provider.match(url));
      expect(result).toBe(false);
    }
  });

  it("find fails with not-yet-implemented error", () => {
    const provider = createBuiltinSourceHostProvider();
    const result = Effect.runSync(
      provider
        .find(
          { type: "builtin" },
          {
            skillNames: [],
            type: "skill",
            scope: Option.none(),
            versionConstraint: Option.none(),
          },
        )
        .pipe(Effect.either),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.what).toContain("not yet implemented");
    }
  });

  it("fetch fails with not-yet-implemented error", () => {
    const provider = createBuiltinSourceHostProvider();
    const result = Effect.runSync(
      provider
        .fetch({ type: "builtin" }, {
          type: "skill",
          refType: "builtin",
          skill: {
            name: "x",
            description: { _tag: "None" } as never,
            metadata: { _tag: "None" } as never,
          },
          source: { type: "builtin" },
        } as never)
        .pipe(Effect.either),
    );
    expect(result._tag).toBe("Left");
  });
});

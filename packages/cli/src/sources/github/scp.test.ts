import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { parseScp } from "./scp.js";

describe("parseScp", () => {
  it.effect("parses git@github.com:owner/repo.git", () =>
    Effect.gen(function* () {
      const result = yield* parseScp("git@github.com:acme/widgets.git");

      expect(result.source).toBe("github");
      expect(result.owner).toBe("acme");
      expect(result.repo).toBe("widgets");
      expect(Option.isNone(result.ref)).toBe(true);
      expect(Option.isNone(result.subPath)).toBe(true);
    }),
  );

  it.effect("parses without .git suffix", () =>
    Effect.gen(function* () {
      const result = yield* parseScp("git@github.com:acme/widgets");

      expect(result.owner).toBe("acme");
      expect(result.repo).toBe("widgets");
    }),
  );

  it.effect("fails on invalid SSH URL", () =>
    Effect.gen(function* () {
      const error = yield* parseScp("not-a-valid-ssh-url").pipe(Effect.flip);

      expect(error._tag).toBe("ParseError");
    }),
  );
});

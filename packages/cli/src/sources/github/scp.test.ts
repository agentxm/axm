import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { parseScp } from "./scp.js";

describe("parseScp", () => {
  it.effect("parses git@github.com:owner/repo.git", () =>
    Effect.gen(function* () {
      const result = yield* parseScp("git@github.com:acme/widgets.git");

      expect(result.type).toBe("github");
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

  it.effect("parses SCP with custom hostname", () =>
    Effect.gen(function* () {
      const result = yield* parseScp("git@ghe.corp.com:acme/widgets.git", "ghe.corp.com");

      expect(result.type).toBe("github");
      expect(result.owner).toBe("acme");
      expect(result.repo).toBe("widgets");
    }),
  );

  it.effect("fails when hostname does not match", () =>
    Effect.gen(function* () {
      const error = yield* parseScp("git@other.com:acme/widgets.git", "ghe.corp.com").pipe(
        Effect.flip,
      );

      expect(error._tag).toBe("CliError");
    }),
  );

  it.effect("fails on invalid SSH URL", () =>
    Effect.gen(function* () {
      const error = yield* parseScp("not-a-valid-ssh-url").pipe(Effect.flip);

      expect(error._tag).toBe("CliError");
    }),
  );
});

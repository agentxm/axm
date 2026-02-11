import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { parseUrl } from "./url.js";

describe("parseUrl", () => {
  it.effect("parses basic https://github.com/owner/repo", () =>
    Effect.gen(function* () {
      const result = yield* parseUrl(new URL("https://github.com/acme/widgets"));

      expect(result.source).toBe("github");
      expect(result.owner).toBe("acme");
      expect(result.repo).toBe("widgets");
      expect(Option.isNone(result.ref)).toBe(true);
      expect(Option.isNone(result.subPath)).toBe(true);
    }),
  );

  it.effect("parses URL with .git suffix", () =>
    Effect.gen(function* () {
      const result = yield* parseUrl(new URL("https://github.com/acme/widgets.git"));

      expect(result.owner).toBe("acme");
      expect(result.repo).toBe("widgets");
    }),
  );

  it.effect("parses URL with ref (tree/branch)", () =>
    Effect.gen(function* () {
      const result = yield* parseUrl(new URL("https://github.com/acme/widgets/tree/main"));

      expect(result.owner).toBe("acme");
      expect(result.repo).toBe("widgets");
      expect(Option.getOrNull(result.ref)).toBe("main");
      expect(Option.isNone(result.subPath)).toBe(true);
    }),
  );

  it.effect("parses URL with ref and subPath", () =>
    Effect.gen(function* () {
      const result = yield* parseUrl(new URL("https://github.com/acme/widgets/tree/main/src/lib"));

      expect(result.owner).toBe("acme");
      expect(result.repo).toBe("widgets");
      expect(Option.getOrNull(result.ref)).toBe("main");
      expect(Option.getOrNull(result.subPath)).toBe("src/lib");
    }),
  );

  it.effect("parses URL with custom hostname", () =>
    Effect.gen(function* () {
      const result = yield* parseUrl(new URL("https://ghe.corp.com/acme/widgets"), "ghe.corp.com");

      expect(result.source).toBe("github");
      expect(result.owner).toBe("acme");
      expect(result.repo).toBe("widgets");
    }),
  );

  it.effect("parses URL with custom hostname and ref", () =>
    Effect.gen(function* () {
      const result = yield* parseUrl(
        new URL("https://ghe.corp.com/acme/widgets/tree/main"),
        "ghe.corp.com",
      );

      expect(result.owner).toBe("acme");
      expect(result.repo).toBe("widgets");
      expect(Option.getOrNull(result.ref)).toBe("main");
    }),
  );

  it.effect("fails when hostname does not match", () =>
    Effect.gen(function* () {
      const error = yield* parseUrl(new URL("https://other.com/acme/widgets"), "ghe.corp.com").pipe(
        Effect.flip,
      );

      expect(error._tag).toBe("ParseError");
    }),
  );

  it.effect("fails on invalid GitHub URL", () =>
    Effect.gen(function* () {
      const error = yield* parseUrl(new URL("https://github.com/invalid")).pipe(Effect.flip);

      expect(error._tag).toBe("ParseError");
    }),
  );
});

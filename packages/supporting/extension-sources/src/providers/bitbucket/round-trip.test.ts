import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { BitbucketSourceParams } from "@agentxm/extension-model/unstable/sources/types";
import { printBitbucketSource } from "@agentxm/extension-model/unstable/sources/forge-grammar";
import { parseShorthand } from "./shorthand.js";

const makeSource = (
  overrides: Partial<Pick<BitbucketSourceParams, "owner" | "repo">> & {
    ref?: string;
    subPath?: string;
  } = {},
): BitbucketSourceParams => ({
  type: "bitbucket",
  owner: overrides.owner ?? "acme",
  repo: overrides.repo ?? "widgets",
  ref: Option.fromUndefinedOr(overrides.ref),
  subPath: Option.fromUndefinedOr(overrides.subPath),
});

describe("print round-trip", () => {
  it.effect("owner/repo", () =>
    Effect.gen(function* () {
      const source = makeSource();
      const result = yield* parseShorthand(printBitbucketSource(source));
      expect(result).toEqual(source);
    }),
  );

  it.effect("with ref", () =>
    Effect.gen(function* () {
      const source = makeSource({ ref: "v1.0.0" });
      const result = yield* parseShorthand(printBitbucketSource(source));
      expect(result).toEqual(source);
    }),
  );

  it.effect("with subPath", () =>
    Effect.gen(function* () {
      const source = makeSource({ subPath: "src/lib" });
      const result = yield* parseShorthand(printBitbucketSource(source));
      expect(result).toEqual(source);
    }),
  );

  it.effect("with subPath and ref", () =>
    Effect.gen(function* () {
      const source = makeSource({ subPath: "src/lib", ref: "v2" });
      const result = yield* parseShorthand(printBitbucketSource(source));
      expect(result).toEqual(source);
    }),
  );
});

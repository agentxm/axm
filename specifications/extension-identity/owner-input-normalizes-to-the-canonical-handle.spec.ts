import * as Effect from "effect/Effect";
import * as FastCheck from "effect/testing/FastCheck";
import { describe, expect, it } from "@effect/vitest";

import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions/handle";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "extension-identity/owner-input-normalizes-to-the-canonical-handle",
  title:
    "Owner input that differs only by whitespace or letter case normalizes to the canonical handle",
  statement:
    "Owner input that differs from a canonical owner handle only by surrounding whitespace or letter case shall normalize to that canonical lower-case handle.",
  class: "functional",
  role: "interface",
  goals: ["extension-adoption"],
  methods: ["property", "example"],
  derivedFrom: ["extension-identity/canonical-names-round-trip"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

// Slugs draw from the published handle grammar, capped below its length limit.
const slugArbitrary = FastCheck.stringMatching(/^[a-z0-9_](?:[a-z0-9_-]{0,18}[a-z0-9_])?$/);
const paddingArbitrary = FastCheck.stringMatching(/^[ \t]{0,3}$/);

describe("Owner input normalization", () => {
  it.effect.prop(
    "upper-cased and padded input always normalizes to the canonical handle",
    { slug: slugArbitrary, before: paddingArbitrary, after: paddingArbitrary },
    ({ slug, before, after }) =>
      Effect.sync(() => {
        expect(normalizeHandle(`${before}@${slug.toUpperCase()}${after}`)).toBe(`@${slug}`);
      }),
    { fastCheck: { numRuns: 100 } },
  );

  it.effect("padded or upper-cased owner input normalizes to the canonical handle", () =>
    Effect.sync(() => {
      expect(normalizeHandle("  @ACME ")).toBe("@acme");
    }),
  );
});

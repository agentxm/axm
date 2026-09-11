import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { fc as FastCheck, it as fastCheckIt } from "@fast-check/vitest";

import { normalizeHandle } from "./handle.js";

import { defineSpecification } from "@agentxm/specification-metadata";

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
  fastCheckIt.prop(
    { slug: slugArbitrary, before: paddingArbitrary, after: paddingArbitrary },
    { numRuns: 100 },
  )(
    "upper-cased and padded input always normalizes to the canonical handle",
    ({ slug, before, after }) => {
      expect(normalizeHandle(`${before}@${slug.toUpperCase()}${after}`)).toBe(`@${slug}`);
    },
  );

  it.effect("padded or upper-cased owner input normalizes to the canonical handle", () =>
    Effect.sync(() => {
      expect(normalizeHandle("  @ACME ")).toBe("@acme");
    }),
  );
});

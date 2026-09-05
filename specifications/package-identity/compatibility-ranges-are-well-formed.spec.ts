import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import { VersRangeSchema } from "@agentxm/extension-model/unstable/package-urls";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "package-identity/compatibility-ranges-are-well-formed",
  title:
    "A companion compatibility range is a well-formed vers range with at least one plain constraint",
  statement:
    "A companion compatibility range shall be a vers range with the vers prefix, an ecosystem scheme, and at least one plain constraint, and a range that omits the prefix, carries no constraint, is wildcard-only, or percent-encodes its constraints shall be refused with guidance naming the flaw.",
  class: "functional",
  role: "interface",
  goals: ["authoring-and-creation", "trustworthy-distribution"],
  methods: ["example", "decision-table"],
  derivedFrom: ["package-identity/compatibility-ranges-match-the-package-ecosystem"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const decodeRange = Schema.decodeUnknownEffect(VersRangeSchema);

describe("Companion compatibility range grammar", () => {
  it.effect("a well-formed range decodes into its ecosystem and ordered constraints", () =>
    Effect.gen(function* () {
      const range = yield* decodeRange("vers:npm/>=1.0.0|<2.0.0");
      expect(range.raw).toBe("vers:npm/>=1.0.0|<2.0.0");
      expect(range.scheme).toBe("npm");
      expect(range.constraints).toEqual([
        { comparator: ">=", version: "1.0.0" },
        { comparator: "<", version: "2.0.0" },
      ]);
    }),
  );

  it.effect.each([
    { value: ">=1.0.0|<2.0.0", flaw: "a missing range prefix", guidance: "vers:" },
    { value: "vers:npm/", flaw: "an empty constraint list", guidance: "at least one constraint" },
    { value: "vers:npm/*", flaw: "a wildcard-only range", guidance: "omit versionRange" },
    {
      value: "vers:npm/%3E%3D1.0.0",
      flaw: "percent-encoded constraints",
      guidance: "percent-encoded",
    },
  ] as const)("refuses $flaw with pointed guidance", ({ value, guidance }) =>
    Effect.gen(function* () {
      const failure = yield* decodeRange(value).pipe(Effect.flip);
      expect(String(failure)).toContain(guidance);
    }),
  );
});

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import {
  CompanionPackageSchema,
  VersRangeSchema,
} from "@agentxm/client-core/unstable/package-urls";

import { defineSpecification } from "../../support/contract.js";

export const specification = defineSpecification({
  requirement: "client-core/package-identity/compatibility-ranges-match-the-package-ecosystem",
  title:
    "A companion compatibility range is a concrete ecosystem range matching its package identity",
  class: "functional",
  intents: ["authoring-and-creation", "trustworthy-distribution"],
  methods: ["example", "decision-table"],
});

const decodeRange = Schema.decodeUnknownEffect(VersRangeSchema);
const decodeCompanion = Schema.decodeUnknownEffect(CompanionPackageSchema);

describe("Companion compatibility ranges", () => {
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
    { value: "vers:pypi/>=2.31.0", ecosystem: "pypi" },
    { value: "vers:cargo/>=1.0.0", ecosystem: "cargo" },
  ] as const)("accepts the concrete ecosystem $ecosystem", ({ value, ecosystem }) =>
    Effect.gen(function* () {
      const range = yield* decodeRange(value);
      expect(range.scheme).toBe(ecosystem);
    }),
  );

  it.effect.each([
    { value: ">=1.0.0|<2.0.0", flaw: "a missing range prefix", guidance: "vers:" },
    { value: "vers:npm/", flaw: "an empty constraint list", guidance: "at least one constraint" },
    { value: "vers:semver/>=1.0.0", flaw: "a generic version scheme", guidance: "generic schemes" },
    {
      value: "vers:madeup/>=1.0.0",
      flaw: "an unknown ecosystem",
      guidance: "not a known concrete package ecosystem",
    },
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

  it.effect.each([
    { purl: "pkg:npm/example", range: "vers:npm/>=1.0.0", ecosystem: "npm" },
    { purl: "pkg:cran/tinyflags", range: "vers:cran/>=0.1.0", ecosystem: "cran" },
    {
      purl: "pkg:swift/example.com/agentxm/example-tinyflags-swift",
      range: "vers:swift/>=0.1.0",
      ecosystem: "swift",
    },
  ] as const)("accepts $purl with a matching $ecosystem range", ({ purl, range, ecosystem }) =>
    Effect.gen(function* () {
      const companion = yield* decodeCompanion({ purl, versionRange: range });
      expect(companion.versionRange?.scheme).toBe(ecosystem);
      expect(companion.versionRange?.raw).toBe(range);
    }),
  );

  it.effect("refuses a range whose ecosystem differs from the package identity, naming both", () =>
    Effect.gen(function* () {
      const failure = yield* decodeCompanion({
        purl: "pkg:pypi/example",
        versionRange: "vers:npm/>=1.0.0",
      }).pipe(Effect.flip);
      expect(String(failure)).toContain("pypi");
      expect(String(failure)).toContain("npm");
    }),
  );
});

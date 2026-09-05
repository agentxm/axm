import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import { CompanionPackageSchema } from "@agentxm/extension-model/unstable/package-urls";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "package-identity/compatibility-ranges-match-the-package-ecosystem",
  title: "A companion compatibility range names the same ecosystem as its package identity",
  statement:
    "A companion declaration that carries a compatibility range shall be accepted only when the range names the same package ecosystem as the package identity, and a mismatched pair shall be refused with guidance naming both ecosystems.",
  class: "functional",
  role: "interface",
  goals: ["authoring-and-creation", "trustworthy-distribution"],
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const decodeCompanion = Schema.decodeUnknownEffect(CompanionPackageSchema);

describe("Companion compatibility ranges agree with the package identity", () => {
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

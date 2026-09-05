import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import {
  CompanionPackageSchema,
  PackageIdentityPurlSchema,
} from "@agentxm/extension-model/unstable/package-urls";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "package-identity/companion-packages-are-identities-not-pins",
  title: "A companion package names an ecosystem package identity, never a pinned version",
  statement:
    "A companion package shall be declared by a versionless package identity, and a declaration that pins a version shall be refused with guidance toward the compatibility range.",
  class: "functional",
  role: "interface",
  goals: ["authoring-and-creation", "trustworthy-distribution"],
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const decodeIdentity = Schema.decodeUnknownEffect(PackageIdentityPurlSchema);
const decodeCompanion = Schema.decodeUnknownEffect(CompanionPackageSchema);

describe("Companion package identities", () => {
  it.effect.each([
    { purl: "pkg:npm/example", form: "a bare ecosystem package" },
    { purl: "pkg:npm/%40scope/example", form: "a scoped package with an encoded namespace" },
    { purl: "pkg:cran/tinyflags", form: "a package from a versionless ecosystem" },
    {
      purl: "pkg:swift/example.com/agentxm/example-tinyflags-swift",
      form: "a package with a namespace path",
    },
  ] as const)("accepts $form unchanged", ({ purl }) =>
    Effect.gen(function* () {
      expect(yield* decodeIdentity(purl)).toBe(purl);
    }),
  );

  it.effect(
    "a version-bearing package reference is refused with guidance toward the compatibility range",
    () =>
      Effect.gen(function* () {
        const failure = yield* decodeIdentity("pkg:npm/example@1.2.3").pipe(Effect.flip);
        expect(String(failure)).toContain("identities, not pins");
        expect(String(failure)).toContain("versionRange");
      }),
  );

  it.effect("a version-bearing companion declaration is refused as a whole", () =>
    Effect.gen(function* () {
      const failure = yield* decodeCompanion({ purl: "pkg:cran/tinyflags@0.1.0" }).pipe(
        Effect.flip,
      );
      expect(String(failure)).toContain("identities, not pins");
    }),
  );

  it.effect("an identity-only declaration carries no compatibility range", () =>
    Effect.gen(function* () {
      const companion = yield* decodeCompanion({ purl: "pkg:npm/example" });
      expect(companion.purl).toBe("pkg:npm/example");
      expect(companion.versionRange).toBeUndefined();
    }),
  );
});

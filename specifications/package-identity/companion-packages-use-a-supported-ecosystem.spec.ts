import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import {
  CompanionPackageSchema,
  VersRangeSchema,
} from "@agentxm/extension-model/unstable/package-urls";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "package-identity/companion-packages-use-a-supported-ecosystem",
  title: "Companion packages and their compatibility ranges name a supported package ecosystem",
  statement:
    "A companion package identity and its compatibility range shall each name a supported concrete package ecosystem, and a declaration naming a generic version scheme or an ecosystem the product does not support shall be refused with guidance naming that ecosystem.",
  class: "functional",
  role: "interface",
  goals: ["authoring-and-creation", "trustworthy-distribution"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "package-identity/companion-packages-are-identities-not-pins",
    "package-identity/compatibility-ranges-match-the-package-ecosystem",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const decodeRange = Schema.decodeUnknownEffect(VersRangeSchema);
const decodeCompanion = Schema.decodeUnknownEffect(CompanionPackageSchema);

describe("Supported companion package ecosystems", () => {
  it.effect.each([
    { purl: "pkg:generic/cran/tinyflags", ecosystem: "generic" },
    { purl: "pkg:bogus/example", ecosystem: "bogus" },
  ] as const)(
    "refuses the unsupported package ecosystem $ecosystem by name",
    ({ purl, ecosystem }) =>
      Effect.gen(function* () {
        const failure = yield* decodeCompanion({ purl }).pipe(Effect.flip);
        expect(String(failure)).toContain(ecosystem);
      }),
  );

  it.effect.each([
    { value: "vers:pypi/>=2.31.0", ecosystem: "pypi" },
    { value: "vers:cargo/>=1.0.0", ecosystem: "cargo" },
  ] as const)(
    "accepts a compatibility range in the concrete ecosystem $ecosystem",
    ({ value, ecosystem }) =>
      Effect.gen(function* () {
        const range = yield* decodeRange(value);
        expect(range.scheme).toBe(ecosystem);
      }),
  );

  it.effect.each([
    { value: "vers:semver/>=1.0.0", flaw: "a generic version scheme", guidance: "generic schemes" },
    {
      value: "vers:madeup/>=1.0.0",
      flaw: "an unknown ecosystem",
      guidance: "not a known concrete package ecosystem",
    },
  ] as const)(
    "refuses a compatibility range naming $flaw with pointed guidance",
    ({ value, guidance }) =>
      Effect.gen(function* () {
        const failure = yield* decodeRange(value).pipe(Effect.flip);
        expect(String(failure)).toContain(guidance);
      }),
  );
});

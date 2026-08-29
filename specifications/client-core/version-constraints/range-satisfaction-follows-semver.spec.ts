import * as Effect from "effect/Effect";
import * as FastCheck from "effect/testing/FastCheck";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import {
  decodeVersionRangeSync,
  decodeVersionSync,
  versionSatisfiesRange,
  VersionRangeSchema,
  VersionSchema,
} from "@agentxm/client-core/unstable/version-constraints";

import { defineSpecification } from "../../support/contract.js";

export const specification = defineSpecification({
  requirement: "client-core/version-constraints/range-satisfaction-follows-semver",
  title: "A version constraint accepts exactly the versions its semver range allows",
  class: "functional",
  intents: ["extension-adoption", "trustworthy-distribution"],
  methods: ["property", "decision-table", "example"],
});

interface VersionTriple {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

const tripleArbitrary = FastCheck.record({
  major: FastCheck.integer({ min: 0, max: 4 }),
  minor: FastCheck.integer({ min: 0, max: 4 }),
  patch: FastCheck.integer({ min: 0, max: 3 }),
});

const render = ({ major, minor, patch }: VersionTriple): string => `${major}.${minor}.${patch}`;

const compare = (left: VersionTriple, right: VersionTriple): number =>
  left.major - right.major || left.minor - right.minor || left.patch - right.patch;

// SemVer caret semantics, stated independently of the implementation: a caret
// range accepts versions at or above its base that keep the leftmost non-zero
// part unchanged.
const caretAccepts = (candidate: VersionTriple, base: VersionTriple): boolean => {
  if (compare(candidate, base) < 0) return false;
  if (base.major > 0) return candidate.major === base.major;
  if (base.minor > 0) return candidate.major === 0 && candidate.minor === base.minor;
  return candidate.major === 0 && candidate.minor === 0 && candidate.patch === base.patch;
};

const satisfies = (version: string, range: string): boolean =>
  versionSatisfiesRange(decodeVersionSync(version), decodeVersionRangeSync(range));

const decodeRange = Schema.decodeUnknownEffect(VersionRangeSchema);
const decodeVersion = Schema.decodeUnknownEffect(VersionSchema);

describe("Version constraint satisfaction", () => {
  it.effect.prop(
    "a caret constraint accepts exactly the versions that keep the leftmost non-zero part",
    { candidate: tripleArbitrary, base: tripleArbitrary },
    ({ candidate, base }) =>
      Effect.sync(() => {
        expect(satisfies(render(candidate), `^${render(base)}`)).toBe(
          caretAccepts(candidate, base),
        );
      }),
    { fastCheck: { numRuns: 300 } },
  );

  it.effect.prop(
    "an exact constraint accepts exactly its own version",
    { candidate: tripleArbitrary, base: tripleArbitrary },
    ({ candidate, base }) =>
      Effect.sync(() => {
        expect(satisfies(render(candidate), render(base))).toBe(compare(candidate, base) === 0);
      }),
    { fastCheck: { numRuns: 150 } },
  );

  it.effect.prop(
    "the wildcard constraint accepts every version",
    { candidate: tripleArbitrary },
    ({ candidate }) =>
      Effect.sync(() => {
        expect(satisfies(render(candidate), "*")).toBe(true);
      }),
    { fastCheck: { numRuns: 50 } },
  );

  it.effect(
    "a bounded comparator range includes its interior and excludes its bounds' outside",
    () =>
      Effect.sync(() => {
        expect(satisfies("2.9.9", ">=1 <3")).toBe(true);
        expect(satisfies("3.0.0", ">=1 <3")).toBe(false);
        expect(satisfies("0.9.0", ">=1 <3")).toBe(false);
      }),
  );

  it.effect.each([
    { value: "1.2.3", kind: "an exact version" },
    { value: "^1.0.0", kind: "a caret range" },
    { value: "~2.4", kind: "a tilde range" },
    { value: ">=1 <3", kind: "a bounded comparator range" },
    { value: "1.0.0+build.1", kind: "a version with build metadata" },
    { value: "*", kind: "the wildcard" },
    { value: "1.x", kind: "an x-range" },
  ] as const)("accepts $kind as a version constraint", ({ value }) =>
    Effect.gen(function* () {
      expect(yield* decodeRange(value)).toBe(value);
    }),
  );

  it.effect.each([
    { value: "latest", kind: "a distribution tag" },
    { value: "not-a-version", kind: "prose" },
    { value: "", kind: "an empty string" },
  ] as const)("refuses $kind as a version constraint", ({ value }) =>
    Effect.gen(function* () {
      yield* decodeRange(value).pipe(Effect.flip);
    }),
  );

  it.effect.each([{ value: "1.0.0" }, { value: "0.1.0-beta.1" }] as const)(
    "accepts $value as an exact version",
    ({ value }) =>
      Effect.gen(function* () {
        expect(yield* decodeVersion(value)).toBe(value);
      }),
  );

  it.effect.each([
    { value: "v1.0.0", kind: "a leading v" },
    { value: "1.0", kind: "a partial version" },
    { value: "01.0.0", kind: "a leading zero" },
  ] as const)("refuses $value as an exact version because of $kind", ({ value }) =>
    Effect.gen(function* () {
      yield* decodeVersion(value).pipe(Effect.flip);
    }),
  );
});

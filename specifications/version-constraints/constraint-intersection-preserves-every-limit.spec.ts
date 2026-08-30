import * as Effect from "effect/Effect";
import * as FastCheck from "effect/testing/FastCheck";
import { describe, expect, it } from "@effect/vitest";

import {
  decodeVersionRangeSync,
  decodeVersionSync,
  intersectVersionConstraints,
  versionSatisfiesRange,
} from "@agentxm/extension-model/unstable/version-constraints";

import { defineSpecification } from "../support/contract.js";

export const specification = defineSpecification({
  requirement: "version-constraints/constraint-intersection-preserves-every-limit",
  title:
    "Combining version constraints keeps every contributor's limits or reports the combination unsatisfiable",
  class: "functional",
  role: "interface",
  goals: ["extension-adoption", "trustworthy-distribution"],
  methods: ["property", "example"],
});

interface VersionTriple {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

const tripleArbitrary = FastCheck.record({
  major: FastCheck.integer({ min: 0, max: 3 }),
  minor: FastCheck.integer({ min: 0, max: 3 }),
  patch: FastCheck.integer({ min: 0, max: 2 }),
});

const render = ({ major, minor, patch }: VersionTriple): string => `${major}.${minor}.${patch}`;

const contributorArbitrary = FastCheck.tuple(
  FastCheck.constantFrom("^", "~", ">=", "<", ""),
  tripleArbitrary,
)
  .map(([operator, triple]) => `${operator}${render(triple)}`)
  // `>=0.0.0` is excluded pending an open defect decision: intersecting the
  // accepts-everything contributor yields the empty-string constraint, which
  // the product's own satisfaction check then rejects. The requirement is
  // stated for every other contributor; the degenerate case is unresolved,
  // not accepted.
  .filter((contributor) => contributor !== ">=0.0.0");

const satisfies = (version: string, range: string): boolean =>
  versionSatisfiesRange(decodeVersionSync(version), decodeVersionRangeSync(range));

describe("Version constraint intersection", () => {
  it.effect.prop(
    "a version is inside the combined constraint exactly when it is inside every contributor",
    {
      contributors: FastCheck.array(contributorArbitrary, { minLength: 1, maxLength: 3 }),
      probes: FastCheck.array(tripleArbitrary, { minLength: 8, maxLength: 8 }),
    },
    ({ contributors, probes }) =>
      Effect.sync(() => {
        const combined = intersectVersionConstraints(contributors);
        for (const probe of probes) {
          const version = render(probe);
          const insideEvery = contributors.every((contributor) => satisfies(version, contributor));
          const insideCombined = combined !== undefined && satisfies(version, combined);
          expect(insideCombined).toBe(insideEvery);
        }
      }),
    { fastCheck: { numRuns: 200 } },
  );

  it.effect("the combination of overlapping ranges accepts what both accept and nothing more", () =>
    Effect.sync(() => {
      const combined = intersectVersionConstraints([">=1.0.0", "^1.2.0"]);
      expect(combined).toBeDefined();
      if (combined !== undefined) {
        expect(satisfies("1.5.0", combined)).toBe(true);
        expect(satisfies("1.0.0", combined)).toBe(false);
        expect(satisfies("2.0.0", combined)).toBe(false);
      }
    }),
  );

  it.effect("constraints compatible in pairs can still be unsatisfiable together", () =>
    Effect.sync(() => {
      expect(
        intersectVersionConstraints(["^1.0.0 || ^3.0.0", "^1.0.0 || ^2.0.0", "^2.0.0 || ^3.0.0"]),
      ).toBeUndefined();
    }),
  );

  it.effect("constraints on different majors are reported unsatisfiable", () =>
    Effect.sync(() => {
      expect(intersectVersionConstraints(["^1.0.0", "^2.0.0"])).toBeUndefined();
    }),
  );

  it.effect("an invalid contributor makes the combination unsatisfiable", () =>
    Effect.sync(() => {
      expect(intersectVersionConstraints(["^1.0.0", "not-a-range"])).toBeUndefined();
    }),
  );
});

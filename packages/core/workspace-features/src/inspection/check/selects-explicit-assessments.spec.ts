import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { defineSpecification } from "@agentxm/specification-metadata";

import { parseCheckSelection } from "../index.js";

export const specification = defineSpecification({
  requirement: "cli/check/selects-explicit-assessments",
  title: "Local checks assess exactly the requested categories",
  statement:
    "A local check shall request compatibility, ownership, lint and convergence by default, accept an explicit nonempty subset of those categories, reject unknown or empty categories, and share duplicate category work without adding unrequested assessments.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  boundary: "memory",
  boundaryRationale:
    "The assessment selector is evaluated directly; CLI parsing, workspace observations and actual assessment execution require separate boundary evidence.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Selected local assessments", () => {
  it.effect("requests all four categories only when the selection is omitted", () =>
    Effect.gen(function* () {
      expect(yield* parseCheckSelection(undefined)).toEqual([
        "compatibility",
        "ownership",
        "lint",
        "convergence",
      ]);
      expect(yield* parseCheckSelection("lint")).toEqual(["lint"]);
    }),
  );

  it.effect("preserves selected order while sharing duplicate assessments", () =>
    Effect.gen(function* () {
      expect(yield* parseCheckSelection("convergence, ownership,convergence")).toEqual([
        "convergence",
        "ownership",
      ]);
    }),
  );

  it.effect("rejects invalid subsets rather than silently running a different check", () =>
    Effect.gen(function* () {
      for (const input of [
        "",
        " ",
        ",",
        "lint,",
        ",lint",
        "lint,,ownership",
        "health",
        "lint,health",
      ]) {
        const result = yield* Effect.result(parseCheckSelection(input));
        expect(Result.isFailure(result), input).toBe(true);
        if (Result.isFailure(result)) {
          expect(result.failure._tag).toBe("InvalidCheckSelection");
        }
      }
    }),
  );
});

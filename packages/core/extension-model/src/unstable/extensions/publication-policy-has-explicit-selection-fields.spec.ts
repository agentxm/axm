import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Result from "effect/Result";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { PublishOptionsSchema } from "./index.js";

export const specification = defineSpecification({
  requirement: "extension-contracts/publication-policy-has-explicit-selection-fields",
  title: "Publication policy distinguishes inherited, empty, and explicit selection",
  statement:
    "Extension manifests shall accept ordered include and exclude arrays of single-line Git-style patterns, preserve their order and omitted or empty presence, and reject unrecognized publication fields including the superseded ignore field.",
  class: "functional",
  role: "interface",
  goals: ["trustworthy-distribution"],
  boundary: "memory",
  methods: ["decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("publication policy contract", () => {
  for (const input of [
    {},
    { include: [] },
    { include: ["**"], exclude: [] },
    { exclude: ["*.json", "!config.json", "*.json"] },
  ]) {
    it.effect(`preserves ${JSON.stringify(input)}`, () =>
      Effect.sync(() => {
        expect(
          Schema.decodeUnknownSync(PublishOptionsSchema, { onExcessProperty: "error" })(input),
        ).toEqual(input);
      }),
    );
  }
  for (const input of [{ ignore: [] }, { exclude: [""] }, { include: ["src/\ndist/"] }]) {
    it.effect(`rejects ${JSON.stringify(input)}`, () =>
      Effect.sync(() => {
        expect(
          Result.isFailure(
            Schema.decodeUnknownResult(PublishOptionsSchema, { onExcessProperty: "error" })(input),
          ),
        ).toBe(true);
      }),
    );
  }
});

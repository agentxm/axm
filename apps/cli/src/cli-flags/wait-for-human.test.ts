/**
 * Which commands offer a bounded wait for device sign-in.
 *
 * Registry writes no longer carry a step-up request. Sign-in is the one
 * command whose device approval can be waited on in the terminal.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { captureHelpDoc } from "../test-support/command-tree-test-helpers.js";

const flagNames = (flags: ReadonlyArray<{ readonly name: string }>) =>
  flags.map((flag) => flag.name);

describe("bounded device sign-in wait flag", () => {
  it.effect("login offers the bounded wait without the resume reference", () =>
    Effect.gen(function* () {
      const doc = yield* captureHelpDoc(["login"]);
      expect(flagNames(doc.flags)).not.toContain("step-up-request");
      expect(flagNames(doc.flags)).toContain("wait-for-human");
    }),
  );

  for (const path of [
    ["unyank"],
    ["yank"],
    ["token", "revoke"],
    ["token", "create"],
    ["visibility", "set"],
    ["visibility", "reconcile"],
  ]) {
    it.effect(`axm ${path.join(" ")} offers neither retired flag`, () =>
      Effect.gen(function* () {
        const doc = yield* captureHelpDoc(path);
        expect(flagNames(doc.flags)).not.toContain("step-up-request");
        expect(flagNames(doc.flags)).not.toContain("wait-for-human");
      }),
    );
  }
});

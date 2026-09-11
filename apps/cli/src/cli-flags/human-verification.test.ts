/**
 * Which commands offer the human-verification flags.
 *
 * `--step-up-request` resumes a challenged Registry write with its original
 * inputs. Sign-in is a different purpose and never carries it, so an
 * invocation that tries to resume a step-up request through `axm login`
 * cannot start a replacement request. The capability rule these flags feed is
 * cli/unattended-verification-is-resumable, which names this file.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { captureHelpDoc } from "../test-support/command-tree-test-helpers.js";

const flagNames = (flags: ReadonlyArray<{ readonly name: string }>) =>
  flags.map((flag) => flag.name);

describe("human-verification flags", () => {
  it.effect("login offers neither the resume reference nor the bounded wait", () =>
    Effect.gen(function* () {
      const doc = yield* captureHelpDoc(["login"]);
      expect(flagNames(doc.flags)).not.toContain("step-up-request");
      expect(flagNames(doc.flags)).not.toContain("wait-for-human");
    }),
  );

  for (const path of [["unyank"], ["yank"], ["token", "create"], ["token", "revoke"]]) {
    it.effect(`axm ${path.join(" ")} offers both`, () =>
      Effect.gen(function* () {
        const doc = yield* captureHelpDoc(path);
        expect(flagNames(doc.flags)).toContain("step-up-request");
        expect(flagNames(doc.flags)).toContain("wait-for-human");
      }),
    );
  }
});

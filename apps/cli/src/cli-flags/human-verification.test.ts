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

  // Yank and un-yank exclude a version from fresh resolution and put it back,
  // and revoking a token takes authority away. None of them destroys anything
  // or widens what anyone can reach, so none asks a signed-in person to prove
  // themselves again and none carries the flags that resume such a request.
  for (const path of [["unyank"], ["yank"], ["token", "revoke"]]) {
    it.effect(`axm ${path.join(" ")} offers neither`, () =>
      Effect.gen(function* () {
        const doc = yield* captureHelpDoc(path);
        expect(flagNames(doc.flags)).not.toContain("step-up-request");
        expect(flagNames(doc.flags)).not.toContain("wait-for-human");
      }),
    );
  }

  it.effect("axm token create offers both", () =>
    Effect.gen(function* () {
      const doc = yield* captureHelpDoc(["token", "create"]);
      expect(flagNames(doc.flags)).toContain("step-up-request");
      expect(flagNames(doc.flags)).toContain("wait-for-human");
    }),
  );
});

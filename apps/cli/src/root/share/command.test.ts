import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { captureHelpText } from "../../test-support/command-tree-test-helpers.js";

describe("root share command help", () => {
  it.effect("documents the Git locator and ecosystem metadata contract", () =>
    Effect.gen(function* () {
      const output = yield* captureHelpText(["share"]);

      expect(output).toContain("Print a Git locator install command");
      expect(output).toContain("origin's self-describing locator");
      expect(output).toContain("package metadata with the Git source");
      expect(output).toContain("locator for the tag at HEAD");
    }),
  );
});

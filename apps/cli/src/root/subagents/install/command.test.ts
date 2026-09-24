import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { captureHelpText as captureHelpOutput } from "../../../test-support/command-tree-test-helpers.js";

describe("subagents install command help", () => {
  it.effect("documents no-arg install and omits the dead --agent flag", () =>
    Effect.gen(function* () {
      const output = yield* captureHelpOutput(["subagents", "install"]);

      expect(output).toContain("Reinstall all configured subagents from their sources");
      expect(output).not.toContain("--agent");
    }),
  );
});

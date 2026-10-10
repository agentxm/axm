import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { captureHelpText as captureHelpOutput } from "../../test-support/command-tree-test-helpers.js";

describe("root uninstall command help", () => {
  it.effect("documents the registry FQN uninstall contract", () =>
    Effect.gen(function* () {
      const output = yield* captureHelpOutput(["uninstall"]);

      expect(output).toContain("Remove an extension from the workspace");
      expect(output).toContain("Unversioned extension FQN in @owner/<plural-type>/<name> form");
      expect(output).toContain("axm uninstall @acme/skills/code-review");
      expect(output).toContain("axm uninstall --preview @acme/hooks/session-audit");
    }),
  );
});

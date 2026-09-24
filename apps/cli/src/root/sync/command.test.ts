import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { captureHelpText } from "../../test-support/command-tree-test-helpers.js";
import { CATALOG_EXTENSION_TYPES } from "@agentxm/extension-model/unstable/extension-types";

describe("root sync command help", () => {
  it.effect("documents the one-shot release-age bypass", () =>
    Effect.gen(function* () {
      const output = yield* captureHelpText(["sync"]);

      const normalized = output.replace(/\s+/gu, " ");
      expect(normalized).toContain("--ignore-release-age");
      expect(normalized).toContain(`choices: ${CATALOG_EXTENSION_TYPES.join(", ")}`);
      expect(normalized).not.toContain(
        "choices: skill, mcp-server, subagent, rule, hook, knowledge, pack",
      );
    }),
  );
});

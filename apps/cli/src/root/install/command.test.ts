import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { captureHelpText } from "../../test-support/command-tree-test-helpers.js";

describe("root install command help", () => {
  it.effect("documents required FQN or locator installation", () =>
    Effect.gen(function* () {
      const output = yield* captureHelpText(["install"]);

      expect(output).toContain("Install extensions from a registry, Git, or path source");
      expect(output).toContain("Registry FQN, Git locator, or path");
      expect(output).toContain("axm install");
      expect(output).toContain("axm install @acme/skills/code-review");
      expect(output).toContain("axm install github:acme/agent-extensions//tools@v1.0.0");
      expect(output).toContain("--ignore-release-age");
      expect(output).toContain("Discover and install from a hosted Git locator");
      expect(output).toContain("Understand locators and accepted resolutions");
    }),
  );
});

describe("subagents install command help", () => {
  it.effect("documents source installation and first-install agent configuration", () =>
    Effect.gen(function* () {
      const output = yield* captureHelpText(["subagents", "install"]);

      expect(output).toContain("Install subagents from a registry, Git, or path source");
      expect(output).toContain("Configure an agent on first install");
    }),
  );
});

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { captureHelpText } from "../../test-support/command-tree-test-helpers.js";

describe("root install command help", () => {
  it.effect("documents the no-arg, FQN, and locator install contract", () =>
    Effect.gen(function* () {
      const output = yield* captureHelpText(["install"]);

      expect(output).toContain(
        "Install extensions from Registry, Git, or path sources, or reinstall configured sources",
      );
      expect(output).toContain("self-describing Git locator, or path locator");
      expect(output).toContain("axm install");
      expect(output).toContain("axm install @acme/skills/code-review");
      expect(output).toContain("axm install github:acme/agent-extensions//tools@v1.0.0");
      expect(output).toContain("shorthand revisions cannot contain");
      expect(output).toContain("--ignore-release-age");
      expect(output).toContain("Discover and install from a hosted Git locator");
      expect(output).toContain("How locators and accepted resolutions differ");
    }),
  );
});

describe("subagents install command help", () => {
  it.effect("documents no-arg install and omits the dead --agent flag", () =>
    Effect.gen(function* () {
      const output = yield* captureHelpText(["subagents", "install"]);

      expect(output).toContain("Reinstall all configured subagents from their sources");
      expect(output).not.toContain("--agent");
    }),
  );
});

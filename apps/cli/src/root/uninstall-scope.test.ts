import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { captureHelpText as captureHelp } from "../test-support/command-tree-test-helpers.js";

describe("mcps install flags", () => {
  it.effect("documents --env as repeatable", () =>
    Effect.gen(function* () {
      const output = yield* captureHelp(["mcps", "install"]);
      expect(output).toContain("--env");
      expect(output).toContain("repeatable");
    }),
  );

  it.effect("does not declare a per-command --non-interactive", () =>
    Effect.gen(function* () {
      // A global --non-interactive still parses; the per-command duplicate was
      // never read by the install operation.
      const output = yield* captureHelp(["mcps", "install"]);
      expect(output).not.toContain("prompting for MCP inputs");
    }),
  );
});

describe("uninstall --scope parity", () => {
  // Every install counterpart already accepts --scope; without it these verbs
  // could only ever uninstall from the project workspace.
  it.effect.each([["skills"], ["mcps"], ["subagents"], ["hooks"]] as const)(
    "%s uninstall accepts --scope",
    ([group]) =>
      Effect.gen(function* () {
        const output = yield* captureHelp([group, "uninstall"]);
        expect(output).toContain("--scope");
        expect(output).toContain("choices: project, user");
      }),
  );
});

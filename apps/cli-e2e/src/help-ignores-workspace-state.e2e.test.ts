/**
 * Built-CLI evidence for `cli/command-help-is-complete`.
 *
 * The specification lives in `apps/cli/src/command-help-is-complete.spec.ts`,
 * beside the command tree whose registered help it walks. These rows keep its
 * malformed-workspace controls: only a real process establishes that a help
 * request replies without reading or changing project or user workspace state.
 */

import { describe, expect, it } from "@effect/vitest";

import { defineExecutionBinding } from "@agentxm/specification-metadata";

import { makeDirectoryFixture } from "./test-support/directory-harness.js";
import { writeMalformedWorkspaceState } from "./test-support/malformed-workspace-fixture.js";
import { snapshotWorkspaceContent } from "./test-support/workspace-fixtures.js";

export const executionBinding = defineExecutionBinding({
  requirements: ["cli/command-help-is-complete"],
  boundary: "process",
  rationale:
    "A registered-tree walk cannot show what a help request does to a populated workspace; only a real invocation against malformed project and user state shows the reply arriving unchanged and nothing being written.",
});

describe("Help ignores workspace state", () => {
  it.each([
    { name: "root", command: [] },
    { name: "skills install", command: ["skills", "install"] },
  ])(
    "$name help replies without changing malformed populated project or user workspaces",
    async ({ command }) => {
      const fixture = makeDirectoryFixture();
      try {
        const args = [...command, "--help"];
        const clean = await fixture.run(args);
        expect(clean.exitCode, clean.stdout + clean.stderr).toBe(0);
        expect(clean.stdout).toContain(["axm", ...command].join(" "));
        expect(clean.stdout.length).toBeGreaterThan(0);
        writeMalformedWorkspaceState(fixture.invoking, fixture.home);
        const before = snapshotWorkspaceContent(fixture.root);
        const malformed = await fixture.run(args);
        expect(malformed.exitCode, malformed.stdout + malformed.stderr).toBe(0);
        expect(malformed.stdout).toBe(clean.stdout);
        expect(malformed.stderr).toBe(clean.stderr);
        expect(snapshotWorkspaceContent(fixture.root)).toEqual(before);
      } finally {
        fixture.cleanup();
      }
    },
  );
});

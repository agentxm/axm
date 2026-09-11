/**
 * Built-CLI evidence for `cli/quiet-preserves-machine-diagnostics`.
 *
 * The specification lives in
 * `apps/cli/src/screen/quiet-preserves-machine-diagnostics.spec.ts`, beside
 * the machine screen that decides suppression. These rows keep its process
 * controls: both quiet spellings and the ordinary default over the real
 * result and diagnostic streams of a spawned CLI.
 */

import { describe, expect, it } from "@effect/vitest";

import { defineExecutionBinding } from "@agentxm/specification-metadata";

import { makeDirectoryFixture, unattendedProjectSetup } from "./test-support/directory-harness.js";
import { writeLocalSkillPackage } from "./test-support/spec-file-store.js";

export const executionBinding = defineExecutionBinding({
  requirements: ["cli/quiet-preserves-machine-diagnostics"],
  boundary: "process",
  rationale:
    "Only a real invocation shows the quiet flag spellings reaching the machine screen and the result and diagnostic streams a caller actually reads.",
});

describe("Quiet machine output over the built CLI", () => {
  it.each([
    { label: "ordinary", flags: [], quiet: false },
    { label: "quiet long flag", flags: ["--quiet"], quiet: true },
    { label: "quiet short flag", flags: ["-q"], quiet: true },
  ])("$label keeps process results and errors visible", async ({ flags, quiet }) => {
    const fixture = makeDirectoryFixture();
    try {
      const setup = await fixture.run(["-C", fixture.selected, ...unattendedProjectSetup]);
      expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
      const source = writeLocalSkillPackage(fixture.root, { name: "quiet-process" });
      const installed = await fixture.run([
        "-C",
        fixture.selected,
        "install",
        source,
        "--json",
        "--non-interactive",
        ...flags,
      ]);
      expect(installed.exitCode, installed.stdout + installed.stderr).toBe(0);
      const result: unknown = JSON.parse(installed.stdout);
      expect(result).toMatchObject({ ok: true, result: { outcome: "applied" } });
      const events: unknown[] = installed.stderr
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      const progress = events.filter(
        (event) =>
          typeof event === "object" &&
          event !== null &&
          "type" in event &&
          event.type === "progress",
      );
      if (quiet) expect(progress).toEqual([]);
      else expect(progress.length).toBeGreaterThan(0);
      const refused = await fixture.run([
        "-C",
        fixture.selected,
        "list",
        "--unrecognized-diagnostic-example",
        "--json",
        ...flags,
      ]);
      expect(refused.exitCode).toBe(2);
      const error: unknown = JSON.parse(refused.stdout);
      expect(error).toMatchObject({
        ok: false,
        code: "usage",
        detail: expect.stringContaining("--unrecognized-diagnostic-example"),
      });
      const diagnostics: unknown[] = refused.stderr
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      expect(diagnostics).toContainEqual(
        expect.objectContaining({
          type: "error",
          code: "usage",
          message: expect.stringContaining("--unrecognized-diagnostic-example"),
        }),
      );
    } finally {
      fixture.cleanup();
    }
  });
});

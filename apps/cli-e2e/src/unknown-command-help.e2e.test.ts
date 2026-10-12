import { describe, expect, it } from "@effect/vitest";
import { defineExecutionBinding } from "@agentxm/specification-metadata";
import { makeDirectoryFixture } from "./test-support/directory-harness.js";

// Each process persists a fresh diagnostic record; its ID is not the diagnostic.
const stableOutput = (output: string): string =>
  output.replaceAll(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
    "<diagnostic-id>",
  );

export const executionBinding = defineExecutionBinding({
  requirements: ["cli/unknown-commands-remain-usage-errors"],
  boundary: "process",
  rationale:
    "A built CLI invocation verifies the process exit code and human and JSON output channels.",
});

describe("Unknown commands with help or version", () => {
  for (const command of [["inspect"], ["find"], ["outdated"], ["skills", "bogus"]]) {
    for (const json of [false, true]) {
      it(`${command.join(" ")} remains a usage error in ${json ? "JSON" : "human"} output`, async () => {
        const fixture = makeDirectoryFixture();
        try {
          const output = json ? ["--json"] : [];
          const ordinary = await fixture.run([...command, ...output]);
          expect(ordinary.exitCode).toBe(2);
          for (const flag of ["--help", "-h", "--version"]) {
            const result = await fixture.run([...command, flag, ...output]);
            expect(result.exitCode, result.stdout + result.stderr).toBe(2);
            expect(stableOutput(result.stdout)).toBe(stableOutput(ordinary.stdout));
            expect(stableOutput(result.stderr)).toBe(stableOutput(ordinary.stderr));
          }
          if (json) {
            const document: unknown = JSON.parse(ordinary.stdout);
            expect(document).toMatchObject({
              ok: false,
              code: "usage",
              suggestions: [{ cmd: command.length > 1 ? "axm skills --help" : "axm --help" }],
            });
          } else {
            expect(ordinary.stdout).toBe("");
            expect(ordinary.stderr).toContain(command.at(-1));
          }
        } finally {
          fixture.cleanup();
        }
      });
    }
  }
});

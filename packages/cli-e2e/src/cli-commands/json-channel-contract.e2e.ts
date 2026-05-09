/**
 * E2E acceptance tests for the global JSON-mode channel contract.
 *
 * For every public command class (query, mutating, error), with `--json`:
 * - stdout is exactly one valid JSON document
 * - every non-empty stderr line parses via JSON.parse
 *
 * These assertions verify the channel contract surfaced by AXM-675 and are
 * intentionally minimal — per-command shape is covered elsewhere.
 */

import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "../e2e/utils.js";

interface JsonChannelChecks {
  readonly stdoutDocument: unknown;
  readonly stderrEvents: ReadonlyArray<unknown>;
}

const assertJsonChannelContract = (result: {
  stdout: string;
  stderr: string;
}): JsonChannelChecks => {
  // stdout must be exactly one JSON document — JSON.parse on the full buffer
  // succeeds only when there is no trailing data after the document.
  const stdoutDocument: unknown = JSON.parse(result.stdout);

  // every non-empty stderr line must JSON.parse
  const stderrLines = result.stderr.split("\n").filter((line) => line.trim().length > 0);
  const stderrEvents = stderrLines.map((line): unknown => JSON.parse(line));

  return { stdoutDocument, stderrEvents };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

describe("JSON-mode channel contract (--json)", () => {
  describe("query class", () => {
    it("axm help --json emits one stdout document and parseable stderr", async () => {
      const result = await runCli(["help", "--json"]);

      expect(result.exitCode).toBe(0);
      const { stdoutDocument } = assertJsonChannelContract(result);
      expect(isRecord(stdoutDocument)).toBe(true);
      if (isRecord(stdoutDocument)) {
        expect(stdoutDocument["ok"]).toBe(true);
      }
    });
  });

  describe("mutating class", () => {
    it("axm setup --json emits one stdout document and parseable stderr", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(
          ["setup", "--yes", "--non-interactive", "--agent", "claude-code", "--json"],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);
        const { stdoutDocument } = assertJsonChannelContract(result);
        expect(isRecord(stdoutDocument)).toBe(true);
        if (isRecord(stdoutDocument)) {
          expect(stdoutDocument["ok"]).toBe(true);
        }
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("error class", () => {
    it("axm help <unknown-topic> --json emits one stdout error envelope and parseable stderr", async () => {
      const result = await runCli(["help", "definitely-not-a-real-topic", "--json"]);

      expect(result.exitCode).not.toBe(0);
      const { stdoutDocument, stderrEvents } = assertJsonChannelContract(result);
      expect(isRecord(stdoutDocument)).toBe(true);
      if (isRecord(stdoutDocument)) {
        expect(stdoutDocument["ok"]).toBe(false);
        expect(stdoutDocument["code"]).toBe("not_found");
      }
      // stderr should carry at least the matching machine error event
      const hasErrorEvent = stderrEvents.some(
        (event) => isRecord(event) && event["type"] === "error" && event["code"] === "not_found",
      );
      expect(hasErrorEvent).toBe(true);
    });
  });
});

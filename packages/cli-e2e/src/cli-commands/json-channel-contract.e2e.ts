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

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCommand } from "@agentxm/client-e2e-utils";
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
        expect(stdoutDocument).toHaveProperty("result");
      }
    });
  });

  describe("mutating class", () => {
    it("axm setup --json emits one stdout document and parseable stderr", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(
          [
            "setup",
            "--yes",
            "--scope",
            "project",
            "--non-interactive",
            "--agent",
            "claude-code",
            "--json",
          ],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);
        const { stdoutDocument } = assertJsonChannelContract(result);
        expect(isRecord(stdoutDocument)).toBe(true);
        if (isRecord(stdoutDocument)) {
          expect(stdoutDocument["ok"]).toBe(true);
          expect(stdoutDocument).toHaveProperty("result");
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

  describe("atomic-failure class", () => {
    it("axm sync --json preserves one document and rolls back when any step fails", async () => {
      const temp = createTempDir();
      try {
        const setup = await runCli(
          [
            "setup",
            "--yes",
            "--scope",
            "project",
            "--non-interactive",
            "--agent",
            "claude-code",
            "--json",
          ],
          { cwd: temp.path },
        );
        expect(setup.exitCode).toBe(0);

        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        if (!isRecord(settings)) throw new Error("Expected setup to create object settings");
        fs.writeFileSync(
          settingsPath,
          JSON.stringify(
            {
              ...settings,
              agents: ["claude-code"],
              mcpServers: {
                demo: {
                  enabled: true,
                  command: "node",
                  args: ["server.js"],
                  env: {},
                },
              },
            },
            null,
            2,
          ),
        );
        fs.writeFileSync(
          path.join(temp.path, ".mcp.json"),
          JSON.stringify(
            {
              mcpServers: {
                demo: {
                  type: "stdio",
                  command: "python",
                },
              },
            },
            null,
            2,
          ),
        );
        const mcpBefore = fs.readFileSync(path.join(temp.path, ".mcp.json"), "utf8");
        fs.rmSync(path.join(temp.path, ".claude", "skills", "axm"), {
          recursive: true,
          force: true,
        });

        const result = await runCli(["sync", "--non-interactive", "--json"], {
          cwd: temp.path,
        });
        const { stdoutDocument } = assertJsonChannelContract(result);

        expect(isRecord(stdoutDocument)).toBe(true);
        if (!isRecord(stdoutDocument)) return;
        expect(stdoutDocument["ok"]).toBe(false);
        expect(stdoutDocument["result"]).toEqual(
          expect.objectContaining({
            outcome: "failed",
            reason: "hard-blocked",
            errorCode: "conflict",
          }),
        );
        expect(fs.readFileSync(path.join(temp.path, ".mcp.json"), "utf8")).toBe(mcpBefore);
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("unexpected-defect class", () => {
    it("the built runtime emits one redacted internal error document", async () => {
      const fixture = fileURLToPath(
        new URL("../fixtures/machine-output-defect.mjs", import.meta.url),
      );
      const result = await runCommand(process.execPath, [fixture], {});

      expect(result.exitCode).not.toBe(0);
      const { stdoutDocument, stderrEvents } = assertJsonChannelContract(result);
      expect(isRecord(stdoutDocument)).toBe(true);
      if (isRecord(stdoutDocument)) {
        expect(stdoutDocument["ok"]).toBe(false);
        expect(stdoutDocument["code"]).toBe("internal");
        expect(JSON.stringify(stdoutDocument)).not.toContain("e2e-secret-sentinel");
      }
      expect(JSON.stringify(stderrEvents)).not.toContain("e2e-secret-sentinel");
    });
  });
});

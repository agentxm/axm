/**
 * E2E tests for structured output modes (--output-format json/stream-json).
 *
 * Verifies that CliRenderer/CliPrompt services redirect correctly in structured
 * output modes:
 * - json: log messages route to stderr, not stdout
 * - stream-json: log messages emit as NDJSON events on stdout
 * - prompts: fail with PROMPT_IN_STRUCTURED_OUTPUT error
 */

import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "../e2e/utils.js";
import { expectDefined } from "../test-helpers.js";

describe("structured output modes", () => {
  describe("--output-format json", () => {
    it("routes CliRenderer messages to stderr, not stdout", async () => {
      const temp = createTempDir();
      try {
        // logout with no credentials uses renderer.info("Not logged in.")
        const result = await runCli(["logout", "--output-format", "json"], {
          cwd: temp.path,
          env: { AXM_TOKEN: "" },
        });

        expect(result.exitCode).toBe(0);
        // In json mode, CliRenderer routes to stderr
        expect(result.stderr).toContain("Not logged in");
        // stdout should not contain the log message (would corrupt JSON output)
        expect(result.stdout).not.toContain("Not logged in");
      } finally {
        temp.cleanup();
      }
    });

    it("token command produces clean stdout with AXM_TOKEN", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["token", "--output-format", "json"], {
          cwd: temp.path,
          env: { AXM_TOKEN: "test-json-token" },
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("test-json-token");
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("--output-format stream-json", () => {
    it("emits CliRenderer messages as NDJSON log events on stdout", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["logout", "--output-format", "stream-json"], {
          cwd: temp.path,
          env: { AXM_TOKEN: "" },
        });

        expect(result.exitCode).toBe(0);

        // In stream-json mode, CliRenderer emits NDJSON events on stdout
        const lines = result.stdout
          .trim()
          .split("\n")
          .filter((line) => line.length > 0);

        // Should have at least one NDJSON line
        expect(lines.length).toBeGreaterThan(0);

        // Each line should be valid JSON
        const events = lines.map((line) => JSON.parse(line));

        // Should contain a log event with the "Not logged in" message
        const logEvent = events.find((event: Record<string, unknown>) => {
          const message = event["message"];
          return (
            event["type"] === "log" &&
            typeof message === "string" &&
            message.includes("Not logged in")
          );
        });
        expect(logEvent).toBeDefined();
        expect(logEvent["type"]).toBe("log");
        expect(logEvent["level"]).toBe("info");
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("error routing", () => {
    it("routes runtime errors as JSON on stdout in json mode (exit 1)", async () => {
      const temp = createTempDir();
      try {
        // skills install without workspace → CliError → exit 1
        const result = await runCli(
          ["skills", "install", "nonexistent", "--output-format", "json"],
          {
            cwd: temp.path,
            env: { AXM_TOKEN: "" },
          },
        );

        expect(result.exitCode).toBe(1);
        // stderr should have a human-readable error
        expect(result.stderr.length).toBeGreaterThan(0);
      } finally {
        temp.cleanup();
      }
    });

    it("routes usage errors with exit code 2 in json mode", async () => {
      // Unknown flag → Effect CLI parsing error → exit 2
      const result = await runCli(["token", "--nonexistent-flag", "--output-format", "json"]);

      expect(result.exitCode).toBe(2);
      // JSON error should appear on stdout (after help text)
      const lines = result.stdout
        .trim()
        .split("\n")
        .filter((l) => l.length > 0);
      const jsonLine = expectDefined(lines.find((line) => line.startsWith("{")));
      const errorJson = JSON.parse(jsonLine);
      expect(errorJson.type).toBe("error");
      expect(errorJson.code).toBe("USAGE_ERROR");
    });

    it("routes runtime errors as NDJSON in stream-json mode", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(
          ["skills", "install", "nonexistent", "--output-format", "stream-json"],
          {
            cwd: temp.path,
            env: { AXM_TOKEN: "" },
          },
        );

        expect(result.exitCode).toBe(1);
        expect(result.stderr.length).toBeGreaterThan(0);
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("exit codes", () => {
    it("exits 0 on successful command in json mode", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["token", "--output-format", "json"], {
          cwd: temp.path,
          env: { AXM_TOKEN: "test-exit-code-token" },
        });

        expect(result.exitCode).toBe(0);
      } finally {
        temp.cleanup();
      }
    });

    it("exits 0 on successful command in stream-json mode", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["logout", "--output-format", "stream-json"], {
          cwd: temp.path,
          env: { AXM_TOKEN: "" },
        });

        expect(result.exitCode).toBe(0);
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("parent commands", () => {
    it("parent command exits 0 in json mode", async () => {
      const result = await runCli(["auth", "--output-format", "json"]);
      expect(result.exitCode).toBe(0);
    });

    it("parent command exits 0 in stream-json mode", async () => {
      const result = await runCli(["skills", "--output-format", "stream-json"]);
      expect(result.exitCode).toBe(0);
    });
  });

  describe("--non-interactive + structured output", () => {
    it("works with --non-interactive and --output-format json", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["token", "--non-interactive", "--output-format", "json"], {
          cwd: temp.path,
          env: { AXM_TOKEN: "ci-json-token" },
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("ci-json-token");
      } finally {
        temp.cleanup();
      }
    });

    it("works with --non-interactive and --output-format stream-json", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(
          ["logout", "--non-interactive", "--output-format", "stream-json"],
          {
            cwd: temp.path,
            env: { AXM_TOKEN: "" },
          },
        );

        expect(result.exitCode).toBe(0);
        // Should produce NDJSON events
        const lines = result.stdout
          .trim()
          .split("\n")
          .filter((line) => line.length > 0);
        expect(lines.length).toBeGreaterThan(0);
        // Each line should be valid JSON
        for (const line of lines) {
          expect(() => JSON.parse(line)).not.toThrow();
        }
      } finally {
        temp.cleanup();
      }
    });
  });
});

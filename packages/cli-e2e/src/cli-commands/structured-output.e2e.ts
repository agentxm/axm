/**
 * E2E tests for structured output via global --json.
 *
 * Explicit --json makes command results and built-in help/version output
 * machine-readable on stdout, while renderer chrome stays on stderr as NDJSON.
 * Parse and usage failures still report human diagnostics on stderr.
 */

import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "../e2e/utils.js";

const getJsonLines = (output: string): ReadonlyArray<string> =>
  output
    .trim()
    .split("\n")
    .filter((line) => line.startsWith("{"));

const parseJson = (output: string): Record<string, unknown> => JSON.parse(output);

describe("structured output (--json)", () => {
  it("routes CliRenderer messages to NDJSON log events on stderr", async () => {
    const temp = createTempDir();
    try {
      const result = await runCli(["logout", "--json"], {
        cwd: temp.path,
        env: { AXM_TOKEN: "" },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain("Not logged in");

      const events = getJsonLines(result.stderr).map((line) => JSON.parse(line));
      const logEvent = events.find((event: Record<string, unknown>) => {
        const message = event["message"];
        return (
          event["type"] === "log" &&
          typeof message === "string" &&
          message.includes("Not logged in")
        );
      });

      expect(logEvent).toBeDefined();
      expect(logEvent).toMatchObject({ type: "log", level: "info" });
    } finally {
      temp.cleanup();
    }
  });

  it("token --json produces structured stdout", async () => {
    const temp = createTempDir();
    try {
      const result = await runCli(["token", "--json"], {
        cwd: temp.path,
        env: { AXM_TOKEN: "test-json-token" },
      });

      expect(result.exitCode).toBe(0);
      expect(parseJson(result.stdout)).toEqual({ token: "test-json-token" });
    } finally {
      temp.cleanup();
    }
  });

  it("formats built-in --help as JSON when explicitly requested", async () => {
    const result = await runCli(["--help", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(parseJson(result.stdout)).toMatchObject({
      type: "help",
      usage: "axm <subcommand> [flags]",
    });
  });

  it("formats built-in --version as JSON when explicitly requested", async () => {
    const result = await runCli(["--version", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(parseJson(result.stdout)).toMatchObject({
      type: "version",
      name: "axm",
    });
  });

  describe("error routing", () => {
    it("routes runtime errors as JSON on stdout in json mode", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["token", "--json"], {
          cwd: temp.path,
          env: { AXM_TOKEN: "" },
        });

        expect(result.exitCode).toBe(1);
        expect(parseJson(result.stdout)).toMatchObject({
          type: "error",
          code: "AUTH_LOGIN_REQUIRED",
        });
        expect(result.stderr).toContain("No token available");
      } finally {
        temp.cleanup();
      }
    });

    it("keeps usage diagnostics on stderr in json mode", async () => {
      const result = await runCli(["token", "--nonexistent-flag", "--json"]);

      expect(result.exitCode).toBe(1);
      expect(parseJson(result.stdout)).toMatchObject({
        type: "help",
        usage: "axm token [flags]",
      });
      expect(result.stderr).toContain("Unrecognized flag: --nonexistent-flag");
      expect(getJsonLines(result.stderr)).toHaveLength(0);
    });
  });

  it("parent commands still show structured help and exit 0 in json mode", async () => {
    const result = await runCli(["auth", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(parseJson(result.stdout)).toMatchObject({
      type: "help",
      usage: "axm auth <subcommand> [flags]",
    });
  });

  it("works with --non-interactive and --json", async () => {
    const temp = createTempDir();
    try {
      const result = await runCli(["token", "--non-interactive", "--json"], {
        cwd: temp.path,
        env: { AXM_TOKEN: "ci-json-token" },
      });

      expect(result.exitCode).toBe(0);
      expect(parseJson(result.stdout)).toEqual({ token: "ci-json-token" });
    } finally {
      temp.cleanup();
    }
  });
});

/**
 * E2E tests for structured output via global --json.
 *
 * Machine-readable results stay on stdout while renderer chrome is emitted as
 * NDJSON events on stderr.
 */

import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "../e2e/utils.js";

const getJsonLines = (output: string): ReadonlyArray<string> =>
  output
    .trim()
    .split("\n")
    .filter((line) => line.startsWith("{"));

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
      expect(JSON.parse(result.stdout)).toEqual({ token: "test-json-token" });
    } finally {
      temp.cleanup();
    }
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
        expect(JSON.parse(result.stdout)).toMatchObject({
          type: "error",
          code: "AUTH_LOGIN_REQUIRED",
        });
        expect(result.stderr).toContain("No token available");
      } finally {
        temp.cleanup();
      }
    });

    it("still shows help text for usage errors in json mode", async () => {
      const result = await runCli(["token", "--nonexistent-flag", "--json"]);
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.exitCode).toBe(1);
      expect(output).toContain("axm token [flags]");
      expect(output).toContain("Unrecognized flag: --nonexistent-flag");
      expect(getJsonLines(output)).toHaveLength(0);
    });
  });

  it("parent commands still show help and exit 0 in json mode", async () => {
    const result = await runCli(["auth", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("axm auth <subcommand>");
  });

  it("works with --non-interactive and --json", async () => {
    const temp = createTempDir();
    try {
      const result = await runCli(["token", "--non-interactive", "--json"], {
        cwd: temp.path,
        env: { AXM_TOKEN: "ci-json-token" },
      });

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ token: "ci-json-token" });
    } finally {
      temp.cleanup();
    }
  });
});

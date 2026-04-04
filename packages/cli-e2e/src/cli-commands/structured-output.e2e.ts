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
  it("logout --json emits a structured result document", async () => {
    const temp = createTempDir();
    try {
      const result = await runCli(["logout", "--json"], {
        cwd: temp.path,
        env: { AXM_TOKEN: "" },
      });

      expect(result.exitCode).toBe(0);
      expect(parseJson(result.stdout)).toEqual({
        schemaVersion: 1,
        command: "auth.logout",
        result: {
          status: "not-logged-in",
          registryHost: "registry.agentxm.ai",
        },
      });
      expect(result.stderr.trim()).toBe("");
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
      expect(parseJson(result.stdout)).toEqual({
        schemaVersion: 1,
        command: "auth.token",
        data: { token: "test-json-token" },
      });
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
          schemaVersion: 1,
          code: "AUTH_TOKEN_REQUIRED",
        });
        expect(result.stderr).toContain("Persisted credentials are disabled");
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
      expect(parseJson(result.stdout)).toEqual({
        schemaVersion: 1,
        command: "auth.token",
        data: { token: "ci-json-token" },
      });
    } finally {
      temp.cleanup();
    }
  });
});

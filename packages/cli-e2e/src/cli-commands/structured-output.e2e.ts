/**
 * E2E tests for structured output via global --json.
 *
 * Explicit --json makes command results and built-in help/version output
 * machine-readable on stdout, while renderer chrome stays on stderr as NDJSON.
 * Parse and usage failures emit schema-conformant NDJSON diagnostics on stderr.
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
      expect(parseJson(result.stdout)).toMatchObject({
        ok: true,
        result: {
          outcome: "no-op",
          planName: "Log out of AXM registry",
          status: "not-logged-in",
          registryHost: "registry.agentxm.ai",
          steps: [
            {
              label: "Registry credentials",
              status: "unchanged",
              artifact: {
                path: "registry.agentxm.ai",
                scope: "user",
                change: "unchanged",
              },
            },
          ],
        },
        suggestions: [{ description: "Log in to this registry", cmd: "axm login" }],
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
        ok: true,
        result: { data: { token: "test-json-token" } },
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

        expect(result.exitCode).toBe(4);
        expect(parseJson(result.stdout)).toMatchObject({
          ok: false,
          code: "auth",
        });
        expect(result.stderr).toContain("Set the AXM_TOKEN environment variable");
      } finally {
        temp.cleanup();
      }
    });

    it("keeps usage diagnostics on stderr in json mode", async () => {
      const result = await runCli(["token", "--nonexistent-flag", "--json"]);

      expect(result.exitCode).toBe(2);
      expect(parseJson(result.stdout)).toMatchObject({
        ok: false,
        code: "usage",
        title: "Usage Error",
        detail: "Unrecognized flag: --nonexistent-flag in command axm token",
      });
      expect(result.stderr).toContain("Unrecognized flag: --nonexistent-flag");
      expect(getJsonLines(result.stderr)).toHaveLength(1);
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
        ok: true,
        result: { data: { token: "ci-json-token" } },
      });
    } finally {
      temp.cleanup();
    }
  });
});

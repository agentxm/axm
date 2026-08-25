/**
 * E2E tests for structured output via global --json.
 *
 * Explicit --json makes command results and built-in help/version output
 * machine-readable on stdout, while renderer chrome stays on stderr as NDJSON.
 * Parse and usage failures emit schema-conformant NDJSON diagnostics on stderr.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "../e2e/utils.js";

const getJsonLines = (output: string): ReadonlyArray<string> =>
  output
    .trim()
    .split("\n")
    .filter((line) => line.startsWith("{"));

const parseJson = (output: string): Record<string, unknown> => JSON.parse(output);

const machineDocumentKind = (
  document: Record<string, unknown>,
): "result-envelope-v1" | "error-envelope-v1" | "help-document-v1" | "version-document-v1" => {
  if (document["type"] === "help") return "help-document-v1";
  if (document["type"] === "version") return "version-document-v1";
  return Object.hasOwn(document, "result") ? "result-envelope-v1" : "error-envelope-v1";
};

describe("structured output (--json)", () => {
  it("logout --json emits a structured result document", async () => {
    const temp = createTempDir();
    try {
      const result = await runCli(["logout", "--json"], {
        cwd: temp.path,
        env: { AXM_TOKEN: "" },
      });

      expect(result.exitCode).toBe(0);
      const document = parseJson(result.stdout);
      expect(machineDocumentKind(document)).toBe("result-envelope-v1");
      expect(document).toMatchObject({
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
      const document = parseJson(result.stdout);
      expect(machineDocumentKind(document)).toBe("result-envelope-v1");
      expect(document).toEqual({
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
    const document = parseJson(result.stdout);
    expect(machineDocumentKind(document)).toBe("help-document-v1");
    expect(document).toMatchObject({
      type: "help",
      usage: "axm <subcommand> [flags]",
    });
  });

  it("formats built-in --version as JSON when explicitly requested", async () => {
    const result = await runCli(["--version", "--json"]);

    expect(result.exitCode).toBe(0);
    const document = parseJson(result.stdout);
    expect(machineDocumentKind(document)).toBe("version-document-v1");
    expect(document).toMatchObject({
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

        expect(result.exitCode).toBe(13);
        const document = parseJson(result.stdout);
        expect(machineDocumentKind(document)).toBe("error-envelope-v1");
        expect(document).toMatchObject({
          ok: false,
          code: "auth_required",
        });
        expect(result.stderr).toContain("axm login --device-code --json");
      } finally {
        temp.cleanup();
      }
    });

    it("keeps usage diagnostics on stderr in json mode", async () => {
      const result = await runCli(["token", "--nonexistent-flag", "--json"]);

      expect(result.exitCode).toBe(2);
      const document = parseJson(result.stdout);
      expect(machineDocumentKind(document)).toBe("error-envelope-v1");
      expect(document).toMatchObject({
        ok: false,
        code: "usage",
        title: "Usage Error",
        detail: "Unrecognized flag: --nonexistent-flag in command axm token",
      });
      expect(result.stderr).toContain("Unrecognized flag: --nonexistent-flag");
      expect(getJsonLines(result.stderr)).toHaveLength(1);
    });
  });

  it("keeps semantic failures in the result envelope with a nonzero exit", async () => {
    const temp = createTempDir();
    try {
      const setup = await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
        { cwd: temp.path },
      );
      expect(setup.exitCode, setup.stderr).toBe(0);
      const settingsPath = path.join(temp.path, "axm.json");
      const settings: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      if (typeof settings !== "object" || settings === null || Array.isArray(settings)) {
        throw new Error("Expected object settings");
      }
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({ ...settings, skills: { missing: "@acme/skills/missing" } }, null, 2),
      );

      const result = await runCli(["lint", "--json"], { cwd: temp.path });
      const document = parseJson(result.stdout);

      expect(result.exitCode).toBe(1);
      expect(machineDocumentKind(document)).toBe("result-envelope-v1");
      expect(document).toMatchObject({
        ok: false,
        result: { summary: { exitCategory: "errors" } },
      });
    } finally {
      temp.cleanup();
    }
  });

  it("parent commands still show structured help and exit 0 in json mode", async () => {
    const result = await runCli(["cache", "--json"]);

    expect(result.exitCode).toBe(0);
    const document = parseJson(result.stdout);
    expect(machineDocumentKind(document)).toBe("help-document-v1");
    expect(document).toMatchObject({
      type: "help",
      usage: "axm cache <subcommand> [flags]",
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

import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";

import { createBinaryRunner, createTempDir } from "@agentxm/client-e2e-utils";
import { describe, expect, it } from "vitest";

import { resolveBinaryPath } from "./distribution-targets.js";

const binaryPath = resolveBinaryPath();

const runBinary = createBinaryRunner(binaryPath);

const getOutput = (result: { readonly stdout: string; readonly stderr: string }): string =>
  result.stdout + result.stderr;

const serveCurrentRelease = async (version: string) => {
  const server = http.createServer((_request, response) => {
    const address = server.address();
    if (address === null || typeof address === "string") {
      response.statusCode = 500;
      response.end("Server address unavailable");
      return;
    }
    const origin = `http://127.0.0.1:${address.port}`;
    const binaryName = path.basename(binaryPath);
    response.setHeader("content-type", "application/json");
    response.statusCode = 200;
    response.end(
      JSON.stringify([
        {
          tag_name: `cli-v${version}`,
          draft: false,
          prerelease: false,
          assets: [
            {
              name: binaryName,
              browser_download_url: `${origin}/${binaryName}`,
            },
            {
              name: "SHA256SUMS",
              browser_download_url: `${origin}/SHA256SUMS`,
            },
          ],
        },
      ]),
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Failed to determine release API server address");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      }),
  };
};

const parseInstallMethod = (stdout: string): unknown => {
  const document: unknown = JSON.parse(stdout);
  if (typeof document !== "object" || document === null || !("result" in document)) {
    return undefined;
  }
  const result = document.result;
  if (typeof result !== "object" || result === null || !("installMethod" in result)) {
    return undefined;
  }
  return result.installMethod;
};

describe("compiled binary smoke", () => {
  it("exits 0 with --version and prints a semver", async () => {
    const result = await runBinary(["--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^\d+\.\d+\.\d+(?:[-+][^\s]+)?$/);
  });

  it("exits 0 with --help and prints usage", async () => {
    const result = await runBinary(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(getOutput(result)).toContain("USAGE\n  axm <command> [flags]");
    expect(getOutput(result)).toContain("CORE");
  });

  it("exits non-zero for auth token without credentials", async () => {
    const result = await runBinary(["auth", "token"]);

    expect(result.exitCode).toBe(4);
    expect(getOutput(result)).toContain("(auth)");
    expect(getOutput(result)).toContain("Set the AXM_TOKEN environment variable");
  });

  it("exits non-zero with an explicit init instruction for skills disable in an uninitialized workspace", async () => {
    const temp = createTempDir();

    try {
      const result = await runBinary(
        ["--non-interactive", "skills", "disable", "fake-skill", "--yes"],
        {
          cwd: temp.path,
        },
      );

      expect(result.exitCode).toBe(10);
      expect(getOutput(result)).toContain("Workspace settings not found");
      expect(getOutput(result)).toContain("axm setup");
    } finally {
      temp.cleanup();
    }
  });

  it("recognizes a compiled binary launched from the script install directory", async () => {
    const temp = createTempDir();
    const versionResult = await runBinary(["--version"]);
    expect(versionResult.exitCode).toBe(0);
    const server = await serveCurrentRelease(versionResult.stdout.trim());
    const installedBinary = path.join(
      temp.path,
      ".axm",
      "bin",
      process.platform === "win32" ? "axm.exe" : "axm",
    );

    try {
      fs.mkdirSync(path.dirname(installedBinary), { recursive: true });
      fs.copyFileSync(binaryPath, installedBinary);
      if (process.platform !== "win32") fs.chmodSync(installedBinary, 0o755);
      fs.writeFileSync(
        path.join(temp.path, ".axm", "install-meta.json"),
        JSON.stringify({ method: "script", executablePath: installedBinary }),
      );

      const result = await createBinaryRunner(installedBinary)(["upgrade", "--json"], {
        env: {
          AXM_USER_HOME: temp.path,
          HOME: temp.path,
          USERPROFILE: temp.path,
          AXM_UPGRADE_GITHUB_API_URL: server.baseUrl,
          npm_config_user_agent: "",
        },
      });

      expect(result.exitCode, getOutput(result)).toBe(0);
      expect(parseInstallMethod(result.stdout), result.stdout).toBe("script");
    } finally {
      await server.close();
      temp.cleanup();
    }
  });
});

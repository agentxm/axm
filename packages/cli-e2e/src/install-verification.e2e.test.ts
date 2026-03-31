import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { createBinaryRunner, createTempDir, runCommand } from "@axm.sh/e2e-utils";
import { afterAll, describe, expect, it } from "vitest";

const installMode = process.env["AXM_INSTALL_TEST_MODE"];

if (installMode !== "bash" && installMode !== "powershell" && installMode !== "cmd") {
  throw new Error("AXM_INSTALL_TEST_MODE must be one of: bash, powershell, cmd");
}

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)), "..");
const binaryDir = path.join(repoRoot, "packages", "cli", "dist", "bin");

const artifactNames = new Set([
  "axm-darwin-arm64",
  "axm-darwin-x64",
  "axm-linux-arm64",
  "axm-linux-x64",
  "axm-windows-x64.exe",
]);

interface ServerContext {
  readonly baseUrl: string;
  readonly close: () => Promise<void>;
}

const createBinaryServer = async (): Promise<ServerContext> => {
  if (!fs.existsSync(binaryDir)) {
    throw new Error(
      `Compiled binaries not found at ${binaryDir}. Run 'pnpm exec nx run cli:compile' or set AXM_INSTALL_BASE_URL.`,
    );
  }

  const server = http.createServer((request, response) => {
    const requestUrl = request.url ?? "/";
    const artifactName = path.basename(requestUrl);

    if (!artifactNames.has(artifactName)) {
      response.statusCode = 404;
      response.end("Not found");
      return;
    }

    const artifactPath = path.join(binaryDir, artifactName);

    if (!fs.existsSync(artifactPath)) {
      response.statusCode = 404;
      response.end("Not found");
      return;
    }

    response.statusCode = 200;
    fs.createReadStream(artifactPath).pipe(response);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Failed to determine binary server address");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/releases/latest/download`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
};

const serverContext =
  process.env["AXM_INSTALL_BASE_URL"] && process.env["AXM_INSTALL_BASE_URL"].length > 0
    ? undefined
    : await createBinaryServer();

afterAll(async () => {
  if (serverContext !== undefined) {
    await serverContext.close();
  }
});

const installBaseUrl = process.env["AXM_INSTALL_BASE_URL"] ?? serverContext?.baseUrl;

if (installBaseUrl === undefined || installBaseUrl.length === 0) {
  throw new Error("Failed to resolve AXM_INSTALL_BASE_URL for install verification");
}

const pathSeparator = process.platform === "win32" ? ";" : ":";
const getOutput = (result: { readonly stdout: string; readonly stderr: string }): string =>
  result.stdout + result.stderr;

const createBashEnv = (tempPath: string): Readonly<Record<string, string>> => ({
  HOME: tempPath,
  PATH: `${path.join(tempPath, ".axm", "bin")}${pathSeparator}${process.env["PATH"] ?? ""}`,
  AXM_INSTALL_BASE_URL: installBaseUrl,
});

const createWindowsEnv = (tempPath: string): Readonly<Record<string, string>> => ({
  LOCALAPPDATA: tempPath,
  PATH: `${path.join(tempPath, "axm")}${pathSeparator}${process.env["PATH"] ?? ""}`,
  AXM_INSTALL_BASE_URL: installBaseUrl,
});

const verifyInstalledBinary = async (binaryPath: string) => {
  const runBinary = createBinaryRunner(binaryPath);
  const result = await runBinary(["--version"]);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toMatch(/^axm v\d+\.\d+\.\d+(?:[-+][^\s]+)?$/);
};

describe("install script verification", () => {
  it(`installs axm with ${installMode}`, async () => {
    const temp = createTempDir();

    try {
      if (installMode === "bash") {
        const scriptPath = path.join(repoRoot, "install.sh");
        const result = await runCommand("sh", [scriptPath], {
          cwd: repoRoot,
          env: createBashEnv(temp.path),
        });

        expect(result.exitCode).toBe(0);
        expect(getOutput(result)).toContain("Detected platform:");
        expect(getOutput(result)).toContain("Done! Run 'axm auth login' to get started.");

        await verifyInstalledBinary(path.join(temp.path, ".axm", "bin", "axm"));
        return;
      }

      if (installMode === "powershell") {
        const scriptPath = path.join(repoRoot, "install.ps1");
        const result = await runCommand(
          "powershell",
          ["-ExecutionPolicy", "Bypass", "-File", scriptPath],
          {
            cwd: repoRoot,
            env: createWindowsEnv(temp.path),
          },
        );

        expect(result.exitCode).toBe(0);
        expect(getOutput(result)).toContain("Detected platform: windows-x64");
        expect(getOutput(result)).toContain("Done! Run 'axm auth login' to get started.");

        await verifyInstalledBinary(path.join(temp.path, "axm", "axm.exe"));
        return;
      }

      const scriptPath = path.join(repoRoot, "install.cmd");
      const result = await runCommand("cmd", ["/c", scriptPath], {
        cwd: repoRoot,
        env: createWindowsEnv(temp.path),
      });

      expect(result.exitCode).toBe(0);
      expect(getOutput(result)).toContain("Installing axm...");
      expect(getOutput(result)).toContain("Done! Run 'axm auth login' to authenticate.");

      await verifyInstalledBinary(path.join(temp.path, "axm", "axm.exe"));
    } finally {
      temp.cleanup();
    }
  });
});

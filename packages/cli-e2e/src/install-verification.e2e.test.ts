import * as fs from "node:fs";
import * as crypto from "node:crypto";
import * as http from "node:http";
import * as path from "node:path";

import { createBinaryRunner, createTempDir, runCommand } from "@agentxm/client-e2e-utils";
import { afterAll, describe, expect, it } from "vitest";
import {
  binaryDir,
  repoRoot,
  resolveBinaryPath,
  resolveInstallMode,
} from "./distribution-targets.js";

const installMode = resolveInstallMode();
const expectedVersion = process.env["AXM_EXPECTED_VERSION"];
const fixtureBinaryPath = resolveBinaryPath();
const fixtureVersionResult = await createBinaryRunner(fixtureBinaryPath)(["--version"]);

if (fixtureVersionResult.exitCode !== 0) {
  throw new Error(
    `Fixture binary failed with exit code ${fixtureVersionResult.exitCode}: ${fixtureVersionResult.stderr}`,
  );
}

const fixtureVersion = fixtureVersionResult.stdout.trim();

if (!/^\d+\.\d+\.\d+(?:[-+][^\s]+)?$/u.test(fixtureVersion)) {
  throw new Error(`Fixture binary reported invalid version: ${fixtureVersion}`);
}

const artifactNames = new Set([
  "axm-darwin-arm64",
  "axm-darwin-x64",
  "axm-linux-arm64",
  "axm-linux-x64",
  "axm-windows-x64.exe",
]);

interface ServerContext {
  readonly baseUrl: string;
  readonly apiBaseUrl: string;
  readonly close: () => Promise<void>;
}

const createBinaryServer = async (): Promise<ServerContext> => {
  if (!fs.existsSync(binaryDir)) {
    throw new Error(
      `Compiled binaries not found at ${binaryDir}. Run 'pnpm nx run cli:compile' or set AXM_INSTALL_BASE_URL.`,
    );
  }

  const server = http.createServer((request, response) => {
    const requestUrl = request.url ?? "/";
    if (requestUrl.startsWith("/repos/agentxm/axm/releases")) {
      const address = server.address();
      if (address === null || typeof address === "string") {
        response.statusCode = 500;
        response.end("Server address unavailable");
        return;
      }
      const origin = `http://127.0.0.1:${address.port}`;
      response.setHeader("content-type", "application/json");
      response.statusCode = 200;
      response.end(
        JSON.stringify([
          {
            tag_name: `cli-v${fixtureVersion}`,
            draft: false,
            prerelease: false,
            assets: [
              ...[...artifactNames].map((name) => ({
                name,
                browser_download_url: `${origin}/releases/download/cli-v${fixtureVersion}/${name}`,
              })),
              {
                name: "SHA256SUMS",
                browser_download_url: `${origin}/releases/download/cli-v${fixtureVersion}/SHA256SUMS`,
              },
            ],
          },
        ]),
      );
      return;
    }
    const artifactName = path.basename(requestUrl);

    if (artifactName === "SHA256SUMS") {
      const lines = [...artifactNames]
        .sort()
        .map((name) => {
          const artifactPath = path.join(binaryDir, name);
          if (!fs.existsSync(artifactPath)) return undefined;
          const hash = crypto
            .createHash("sha256")
            .update(fs.readFileSync(artifactPath))
            .digest("hex");
          return `${hash}  ${name}`;
        })
        .filter((line) => line !== undefined);
      response.statusCode = 200;
      response.end(
        requestUrl.includes("/bad/")
          ? `${"0".repeat(64)}  ${path.basename(resolveBinaryPath())}\n`
          : `${lines.join("\n")}\n`,
      );
      return;
    }

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
    apiBaseUrl: `http://127.0.0.1:${address.port}`,
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

const serverContext = await createBinaryServer();

afterAll(async () => {
  await serverContext.close();
});

const installBaseUrl = process.env["AXM_INSTALL_BASE_URL"] ?? serverContext?.baseUrl;

if (installBaseUrl === undefined || installBaseUrl.length === 0) {
  throw new Error("Failed to resolve AXM_INSTALL_BASE_URL for install verification");
}

const pathSeparator = process.platform === "win32" ? ";" : ":";
const getOutput = (result: { readonly stdout: string; readonly stderr: string }): string =>
  result.stdout + result.stderr;

const expectCommandSuccess = (
  label: string,
  result: { readonly exitCode: number; readonly stdout: string; readonly stderr: string },
) => {
  if (result.exitCode === 0) {
    return;
  }

  const output = getOutput(result).trim();

  throw new Error(
    output.length === 0
      ? `${label} failed with exit code ${result.exitCode}`
      : `${label} failed with exit code ${result.exitCode}\n\n${output}`,
  );
};

const createBashEnv = (
  tempPath: string,
  baseUrl = installBaseUrl,
  version = expectedVersion,
): Readonly<Record<string, string>> => ({
  HOME: tempPath,
  AXM_USER_HOME: tempPath,
  PATH: `${path.join(tempPath, ".axm", "bin")}${pathSeparator}${process.env["PATH"] ?? ""}`,
  AXM_INSTALL_BASE_URL: baseUrl,
  AXM_UPGRADE_GITHUB_API_URL: serverContext.apiBaseUrl,
  npm_config_user_agent: "",
  ...(version === undefined ? {} : { AXM_INSTALL_VERSION: version }),
});

const createWindowsEnv = (
  tempPath: string,
  baseUrl = installBaseUrl,
  version = expectedVersion,
): Readonly<Record<string, string>> => ({
  USERPROFILE: tempPath,
  AXM_USER_HOME: tempPath,
  PATH: `${path.join(tempPath, ".axm", "bin")}${pathSeparator}${process.env["PATH"] ?? ""}`,
  AXM_INSTALL_BASE_URL: baseUrl,
  AXM_INSTALL_PS1_PATH: path.join(repoRoot, "install.ps1"),
  AXM_UPGRADE_GITHUB_API_URL: serverContext.apiBaseUrl,
  npm_config_user_agent: "",
  ...(version === undefined ? {} : { AXM_INSTALL_VERSION: version }),
});

const verifyInstalledBinary = async (binaryPath: string) => {
  const runBinary = createBinaryRunner(binaryPath);
  const result = await runBinary(["--version"]);

  expect(result.exitCode).toBe(0);

  const versionOutput = result.stdout.trim();

  if (expectedVersion !== undefined && expectedVersion.length > 0) {
    expect(versionOutput).toBe(expectedVersion);
    return;
  }

  expect(versionOutput).toMatch(/^\d+\.\d+\.\d+(?:[-+][^\s]+)?$/);
};

const expectJsonObject = (value: unknown): Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected a JSON object");
  }
  return Object.fromEntries(Object.entries(value));
};

const parseJsonObject = (input: string): Readonly<Record<string, unknown>> =>
  expectJsonObject(JSON.parse(input));

const expectProgressMessages = (
  stderr: string,
  expectedMessages: ReadonlyArray<string | RegExp>,
) => {
  const progressEvents = stderr
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map(parseJsonObject);
  expect(progressEvents.length).toBeGreaterThan(0);
  expect(progressEvents.every((event) => event["type"] === "progress")).toBe(true);
  const progressMessages = progressEvents.map((event) => event["message"]);
  for (const expectedMessage of expectedMessages) {
    if (typeof expectedMessage === "string") {
      expect(progressMessages).toContain(expectedMessage);
      continue;
    }
    expect(
      progressMessages.some(
        (progressMessage) =>
          typeof progressMessage === "string" && expectedMessage.test(progressMessage),
      ),
    ).toBe(true);
  }
};

const verifyUpgradeModes = async (binaryPath: string, env: Readonly<Record<string, string>>) => {
  const runBinary = createBinaryRunner(binaryPath);
  const jsonResult = await runBinary(["upgrade", "--json"], { env });
  expectCommandSuccess("axm upgrade --json", jsonResult);
  expectProgressMessages(jsonResult.stderr, [
    "Checking AXM releases",
    "Detecting AXM installation method",
  ]);
  const jsonDocument = parseJsonObject(jsonResult.stdout);
  expect(jsonDocument["ok"]).toBe(true);
  const currentResult = expectJsonObject(jsonDocument["result"]);
  expect(currentResult["resultStatus"]).toBe("already-up-to-date");
  expect(currentResult["installMethod"], JSON.stringify(currentResult)).toBe("script");
  expect(currentResult["blockedCount"]).toBe(0);
  expect(currentResult["failedCount"]).toBe(0);

  const quietResult = await runBinary(["upgrade", "--quiet", "--verbose"], { env });
  expectCommandSuccess("axm upgrade --quiet --verbose", quietResult);
  expect(getOutput(quietResult)).toBe("");

  const noColorResult = await runBinary(["upgrade"], { env: { ...env, NO_COLOR: "1" } });
  expectCommandSuccess("NO_COLOR=1 axm upgrade", noColorResult);
  expect(getOutput(noColorResult)).not.toContain("\u001b");

  const lockPath = `${binaryPath}.upgrade.lock`;
  fs.writeFileSync(
    lockPath,
    JSON.stringify({ pid: process.pid, targetPath: binaryPath, backupPath: null }),
  );
  try {
    const lockedResult = await runBinary(["upgrade", "--force", "--json"], { env });
    if (lockedResult.exitCode !== 1) {
      throw new Error(
        `Locked upgrade exited ${lockedResult.exitCode}; stdout: ${lockedResult.stdout}; stderr: ${lockedResult.stderr}`,
      );
    }
    expectProgressMessages(lockedResult.stderr, [
      "Checking AXM releases",
      "Detecting AXM installation method",
      /^Upgrading AXM to /,
    ]);
    const lockedDocument = parseJsonObject(lockedResult.stdout);
    expect(lockedDocument["ok"]).toBe(false);
    const blockedResult = expectJsonObject(lockedDocument["result"]);
    expect(blockedResult["resultStatus"]).toBe("manual-action-required");
    expect(blockedResult["blockedCount"]).toBe(1);
  } finally {
    fs.rmSync(lockPath, { force: true });
  }
};

const verifyInstallMeta = (metaPath: string) => {
  expect(fs.existsSync(metaPath)).toBe(true);

  const content = fs.readFileSync(metaPath, "utf-8").trim();
  const parsed: unknown = JSON.parse(content);
  if (typeof parsed !== "object" || parsed === null || !("method" in parsed)) {
    throw new Error("Install metadata is not an object");
  }
  const meta = Object.fromEntries(Object.entries(parsed));

  expect(meta["schemaVersion"]).toBe(2);
  expect(meta["method"]).toBe("script");
  expect(meta["installedAt"]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);

  // Verify the timestamp is a valid date and reasonably recent (within last 5 minutes)
  const installedAt = meta["installedAt"];
  if (typeof installedAt !== "string") throw new Error("installedAt is not a string");
  const timestamp = new Date(installedAt);
  expect(timestamp.getTime()).not.toBeNaN();
  expect(Date.now() - timestamp.getTime()).toBeLessThan(5 * 60 * 1000);
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

        expectCommandSuccess("install.sh", result);
        expect(getOutput(result)).toContain("Detected platform:");
        expect(getOutput(result)).toContain("Installed AXM");

        const installedBinary = path.join(temp.path, ".axm", "bin", "axm");
        await verifyInstalledBinary(installedBinary);
        verifyInstallMeta(path.join(temp.path, ".axm", "install-meta.json"));
        await verifyUpgradeModes(installedBinary, createBashEnv(temp.path));
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

        expectCommandSuccess("install.ps1", result);
        expect(getOutput(result)).toContain("Detected platform: windows-x64");
        expect(getOutput(result)).toContain("Installed AXM");

        const installedBinary = path.join(temp.path, ".axm", "bin", "axm.exe");
        await verifyInstalledBinary(installedBinary);
        verifyInstallMeta(path.join(temp.path, ".axm", "install-meta.json"));
        await verifyUpgradeModes(installedBinary, createWindowsEnv(temp.path));
        return;
      }

      const scriptPath = path.join(repoRoot, "install.cmd");
      const result = await runCommand("cmd", ["/c", scriptPath], {
        cwd: repoRoot,
        env: createWindowsEnv(temp.path),
      });

      expectCommandSuccess("install.cmd", result);
      expect(getOutput(result)).toContain("Installed AXM");

      const installedBinary = path.join(temp.path, ".axm", "bin", "axm.exe");
      await verifyInstalledBinary(installedBinary);
      verifyInstallMeta(path.join(temp.path, ".axm", "install-meta.json"));
      await verifyUpgradeModes(installedBinary, createWindowsEnv(temp.path));
    } finally {
      temp.cleanup();
    }
  });

  it(`preserves a working axm on ${installMode} checksum failure`, async () => {
    const temp = createTempDir();
    const sourceBinary = resolveBinaryPath();
    const installedBinary = path.join(
      temp.path,
      ".axm",
      "bin",
      process.platform === "win32" ? "axm.exe" : "axm",
    );
    fs.mkdirSync(path.dirname(installedBinary), { recursive: true });
    fs.copyFileSync(sourceBinary, installedBinary);
    if (process.platform !== "win32") fs.chmodSync(installedBinary, 0o755);
    const before = crypto
      .createHash("sha256")
      .update(fs.readFileSync(installedBinary))
      .digest("hex");
    const versionResult = await createBinaryRunner(sourceBinary)(["--version"]);
    expectCommandSuccess("fixture binary", versionResult);
    const version = versionResult.stdout.trim();
    const badBaseUrl = serverContext.baseUrl.replace(
      "/releases/latest/download",
      "/releases/bad/download",
    );

    try {
      const result =
        installMode === "bash"
          ? await runCommand("sh", [path.join(repoRoot, "install.sh")], {
              cwd: repoRoot,
              env: createBashEnv(temp.path, badBaseUrl, version),
            })
          : installMode === "powershell"
            ? await runCommand(
                "powershell",
                ["-ExecutionPolicy", "Bypass", "-File", path.join(repoRoot, "install.ps1")],
                {
                  cwd: repoRoot,
                  env: createWindowsEnv(temp.path, badBaseUrl, version),
                },
              )
            : await runCommand("cmd", ["/c", path.join(repoRoot, "install.cmd")], {
                cwd: repoRoot,
                env: createWindowsEnv(temp.path, badBaseUrl, version),
              });

      expect(result.exitCode).not.toBe(0);
      const after = crypto
        .createHash("sha256")
        .update(fs.readFileSync(installedBinary))
        .digest("hex");
      expect(after).toBe(before);
      expect(fs.existsSync(`${installedBinary}.upgrade.lock`)).toBe(false);
      expect(
        fs.readdirSync(path.dirname(installedBinary)).filter((name) => name.startsWith(".axm-")),
      ).toEqual([]);
    } finally {
      temp.cleanup();
    }
  });
});

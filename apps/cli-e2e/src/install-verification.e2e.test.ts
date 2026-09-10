import * as fs from "node:fs";
import * as crypto from "node:crypto";
import * as http from "node:http";
import * as path from "node:path";

import { createBinaryRunner, createTempDir, runCommand } from "@agentxm/client-e2e-utils";
import { afterAll, describe, expect, it } from "vitest";
import {
  hostBinaryDir,
  repoRoot,
  resolveHostBinaryPath,
  resolveInstallMode,
} from "./distribution-targets.js";

/**
 * Binds this file's evidence to the requirement identities it executes. The
 * literal shape is read by the specification catalog.
 */
export const executionBinding = {
  requirements: [
    "system/installability/product-installs-through-supported-channels",
    "system/installability/native-installers-use-selected-directory",
    "system/installability/native-installers-explain-shell-access",
    "system/compatibility/supported-platform-matrix",
  ],
  boundary: "installed",
  rationale:
    "Runs the published installer scripts end to end against a served release layout on the selected installer shell, proving checksum-specific rejection, custom destination placement, executable PATH and absolute-path guidance, and a working installed product on that shell. Profile and prior-binary preservation remain observations beyond the installation owner's current meaning.",
} as const;

const installMode = resolveInstallMode();
const expectedVersion = process.env["AXM_EXPECTED_VERSION"];
const fixtureBinaryPath = resolveHostBinaryPath();
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
  readonly requests: ReadonlyArray<string>;
  readonly close: () => Promise<void>;
}

const createBinaryServer = async (): Promise<ServerContext> => {
  if (!fs.existsSync(hostBinaryDir)) {
    throw new Error(
      `Compiled host binary not found at ${hostBinaryDir}. Run 'pnpm exec nx run cli:compile-host'.`,
    );
  }

  const requests: string[] = [];
  const server = http.createServer((request, response) => {
    const requestUrl = request.url ?? "/";
    requests.push(requestUrl);
    const artifactName = path.basename(requestUrl);

    if (artifactName === "SHA256SUMS") {
      const lines = [...artifactNames]
        .sort()
        .map((name) => {
          const artifactPath = path.join(hostBinaryDir, name);
          if (!fs.existsSync(artifactPath)) return undefined;
          const hash = crypto
            .createHash("sha256")
            .update(fs.readFileSync(artifactPath))
            .digest("hex");
          return `${hash}  ${name}`;
        })
        .filter((line) => line !== undefined);
      response.statusCode = 200;
      response.end(`${lines.join("\n")}\n`);
      return;
    }

    if (!artifactNames.has(artifactName)) {
      response.statusCode = 404;
      response.end("Not found");
      return;
    }

    const artifactPath = path.join(hostBinaryDir, artifactName);

    if (!fs.existsSync(artifactPath)) {
      response.statusCode = 404;
      response.end("Not found");
      return;
    }

    response.statusCode = 200;
    const artifact = fs.createReadStream(artifactPath);
    if (requestUrl.includes("/bad/")) {
      // Keep the manifest authentic and alter the actual downloaded bytes.
      artifact.pipe(response, { end: false });
      artifact.once("end", () => response.end("Synthetic checksum mismatch bytes\n"));
    } else {
      artifact.pipe(response);
    }
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
    requests,
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

interface InstallEnvOptions {
  readonly baseUrl?: string;
  readonly version?: string;
  readonly installDir?: string;
  readonly includeInstallDirOnPath?: boolean;
}

const createBashEnv = (
  tempPath: string,
  options: InstallEnvOptions = {},
): Readonly<Record<string, string>> => {
  const installDir = options.installDir ?? path.join(tempPath, ".axm", "bin");
  const basePath = process.env["PATH"] ?? "";
  const version = options.version ?? expectedVersion;

  return {
    HOME: tempPath,
    AXM_USER_HOME: tempPath,
    PATH:
      options.includeInstallDirOnPath === false
        ? basePath
        : `${installDir}${pathSeparator}${basePath}`,
    AXM_INSTALL_BASE_URL: options.baseUrl ?? installBaseUrl,
    npm_config_user_agent: "",
    ...(options.installDir === undefined ? {} : { AXM_INSTALL_DIR: options.installDir }),
    ...(version === undefined ? {} : { AXM_INSTALL_VERSION: version }),
  };
};

const createWindowsEnv = (
  tempPath: string,
  options: InstallEnvOptions = {},
): Readonly<Record<string, string>> => {
  const installDir = options.installDir ?? path.join(tempPath, ".axm", "bin");
  const basePath = process.env["PATH"] ?? "";
  const version = options.version ?? expectedVersion;

  return {
    USERPROFILE: tempPath,
    AXM_USER_HOME: tempPath,
    PATH:
      options.includeInstallDirOnPath === false
        ? basePath
        : `${installDir}${pathSeparator}${basePath}`,
    AXM_INSTALL_BASE_URL: options.baseUrl ?? installBaseUrl,
    AXM_INSTALL_PS1_PATH: path.join(repoRoot, "install.ps1"),
    npm_config_user_agent: "",
    ...(options.installDir === undefined ? {} : { AXM_INSTALL_DIR: options.installDir }),
    ...(version === undefined ? {} : { AXM_INSTALL_VERSION: version }),
  };
};

const verifyInstalledBinary = async (binaryPath: string) => {
  const runBinary = createBinaryRunner(binaryPath);
  const result = await runBinary(["--version"]);

  expect(result.exitCode).toBe(0);

  const versionOutput = result.stdout.trim();

  if (expectedVersion !== undefined && expectedVersion.length > 0) {
    expect(versionOutput).toBe(expectedVersion);
    return;
  }

  expect(versionOutput).toBe(fixtureVersion);
};

const expectJsonObject = (value: unknown): Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected a JSON object");
  }
  return Object.fromEntries(Object.entries(value));
};

const parseJsonObject = (input: string): Readonly<Record<string, unknown>> => {
  try {
    return expectJsonObject(JSON.parse(input));
  } catch (cause) {
    throw new Error(`Expected one JSON object, received ${JSON.stringify(input)}`, { cause });
  }
};

const expectLifecycleUnits = (stderr: string, expectedUnitIds: ReadonlyArray<string>) => {
  const machineEvents = stderr
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map(parseJsonObject);
  expect(machineEvents.length).toBeGreaterThan(0);
  expect(
    machineEvents.every(
      (event) =>
        event["type"] === "progress" ||
        (event["type"] === "log" &&
          ["error", "warn", "info"].includes(String(event["level"])) &&
          typeof event["message"] === "string"),
    ),
  ).toBe(true);
  const lifecycleEvents = machineEvents
    .filter((event) => event["type"] === "progress")
    .map((event) => expectJsonObject(event["event"]));
  expect(lifecycleEvents.length).toBeGreaterThan(0);
  expect(lifecycleEvents[0]?.["_tag"]).toBe("OperationStarted");
  expect(lifecycleEvents[lifecycleEvents.length - 1]?.["_tag"]).toBe("OperationSettled");
  const startedUnitIds = lifecycleEvents
    .filter((event) => event["_tag"] === "UnitStarted")
    .map((event) => event["unitId"]);
  for (const expectedUnitId of expectedUnitIds) {
    expect(startedUnitIds).toContain(expectedUnitId);
  }
};

const verifyUpgradeModes = async (binaryPath: string, env: Readonly<Record<string, string>>) => {
  const runBinary = createBinaryRunner(binaryPath);
  const jsonResult = await runBinary(["upgrade", fixtureVersion, "--json"], { env });
  expectCommandSuccess(`axm upgrade ${fixtureVersion} --json`, jsonResult);
  expectLifecycleUnits(jsonResult.stderr, ["detect-install-method", "resolve-version"]);
  const jsonDocument = parseJsonObject(jsonResult.stdout);
  expect(jsonDocument["ok"]).toBe(true);
  const currentResult = expectJsonObject(jsonDocument["result"]);
  expect(currentResult["contract"]).toBe("axm.upgrade-assessment/v1");
  expect(currentResult["disposition"]).toBe("already-current");
  expect(expectJsonObject(currentResult["ownership"])["method"]).toBe("script");
  expect(currentResult["outcome"]).toBe("no-op");

  const quietResult = await runBinary(["upgrade", fixtureVersion, "--quiet", "--verbose"], {
    env,
  });
  expectCommandSuccess(`axm upgrade ${fixtureVersion} --quiet --verbose`, quietResult);
  expect(getOutput(quietResult)).toContain("already up to date");
  expect(getOutput(quietResult)).not.toContain("AXM installation method");

  const noColorResult = await runBinary(["upgrade", fixtureVersion], {
    env: { ...env, NO_COLOR: "1" },
  });
  expectCommandSuccess(`NO_COLOR=1 axm upgrade ${fixtureVersion}`, noColorResult);
  expect(getOutput(noColorResult)).not.toContain("\u001b");

  const lockPath = `${binaryPath}.upgrade.lock`;
  fs.writeFileSync(
    lockPath,
    JSON.stringify({ pid: process.pid, targetPath: binaryPath, backupPath: null }),
  );
  try {
    const lockedResult = await runBinary(["upgrade", fixtureVersion, "--reinstall", "--json"], {
      env,
    });
    if (lockedResult.exitCode !== 1) {
      throw new Error(
        `Locked upgrade exited ${lockedResult.exitCode}; stdout: ${lockedResult.stdout}; stderr: ${lockedResult.stderr}`,
      );
    }
    expectLifecycleUnits(lockedResult.stderr, [
      "detect-install-method",
      "resolve-version",
      "upgrade",
    ]);
    const lockedDocument = parseJsonObject(lockedResult.stdout);
    expect(lockedDocument["ok"]).toBe(false);
    const blockedResult = expectJsonObject(lockedDocument["result"]);
    expect(blockedResult["disposition"]).toBe("recovery-required");
    expect(blockedResult["outcome"]).toBe("failed");
    expect(expectJsonObject(blockedResult["mutation"])["state"]).toBe("not-attempted");
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
        expect(getOutput(result)).not.toContain("Use AXM in this shell:");

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
          ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
          {
            cwd: repoRoot,
            env: createWindowsEnv(temp.path),
          },
        );

        expectCommandSuccess("install.ps1", result);
        expect(getOutput(result)).toContain("Detected platform: windows-x64");
        expect(getOutput(result)).toContain("Installed AXM");
        expect(getOutput(result)).not.toContain("Use AXM in this shell:");

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
      expect(getOutput(result)).not.toContain("Use AXM in this shell:");

      const installedBinary = path.join(temp.path, ".axm", "bin", "axm.exe");
      await verifyInstalledBinary(installedBinary);
      verifyInstallMeta(path.join(temp.path, ".axm", "install-meta.json"));
      await verifyUpgradeModes(installedBinary, createWindowsEnv(temp.path));
    } finally {
      temp.cleanup();
    }
  });

  it(`prints actionable PATH guidance for ${installMode}`, async () => {
    const temp = createTempDir("axm path guidance ");
    const installDir = path.join(temp.path, "custom bin");
    const profilePath = path.join(temp.path, ".profile");
    const profileContent = "# Existing profile content\n";
    fs.writeFileSync(profilePath, profileContent);

    try {
      const options = { installDir, includeInstallDirOnPath: false } satisfies InstallEnvOptions;
      const result =
        installMode === "bash"
          ? await runCommand("sh", [path.join(repoRoot, "install.sh")], {
              cwd: repoRoot,
              env: createBashEnv(temp.path, options),
            })
          : installMode === "powershell"
            ? await runCommand(
                "powershell",
                [
                  "-NoProfile",
                  "-ExecutionPolicy",
                  "Bypass",
                  "-File",
                  path.join(repoRoot, "install.ps1"),
                ],
                {
                  cwd: repoRoot,
                  env: createWindowsEnv(temp.path, options),
                },
              )
            : await runCommand("cmd", ["/c", path.join(repoRoot, "install.cmd")], {
                cwd: repoRoot,
                env: createWindowsEnv(temp.path, options),
              });

      expectCommandSuccess(`PATH guidance for ${installMode}`, result);
      const output = getOutput(result);
      const installedBinary = path.join(
        installDir,
        process.platform === "win32" ? "axm.exe" : "axm",
      );
      const outputInstalledBinary =
        process.platform === "win32" ? fs.realpathSync.native(installedBinary) : installedBinary;
      const outputInstallDir = path.dirname(outputInstalledBinary);

      expect(output).toContain(`Installed AXM ${fixtureVersion} to ${outputInstalledBinary}`);
      expect(output).toContain("Use AXM in this shell:");
      expect(output).toContain("open a new terminal");
      expect(output).toContain("Verify the installed executable:");
      expect(output).toContain(
        "Automation and non-interactive shells may not load profile changes; set PATH explicitly or use the absolute executable path above.",
      );

      if (installMode === "bash") {
        expect(output).toContain(`export PATH="${outputInstallDir}:$PATH"`);
        expect(output).toContain(
          "add that export to ~/.profile, ~/.bashrc, or ~/.zshrc, then open a new terminal",
        );
        expect(output).toContain(`"${outputInstalledBinary}" --version`);
      } else if (installMode === "powershell") {
        expect(output).toContain(`$env:Path = "${outputInstallDir};" + $env:Path`);
        expect(output).toContain(
          `add "${outputInstallDir}" to your User PATH, then open a new terminal`,
        );
        expect(output).toContain(`& "${outputInstalledBinary}" --version`);
      } else {
        expect(output).toContain(`set "PATH=${outputInstallDir};%PATH%"`);
        expect(output).toContain(
          `add "${outputInstallDir}" to your User PATH, then open a new terminal`,
        );
        expect(output).toContain(`"${outputInstalledBinary}" --version`);
      }

      const printedLines = output.split(/\r?\n/u).map((line) => line.trim());
      const pathCommand =
        installMode === "bash"
          ? `export PATH="${outputInstallDir}:$PATH"`
          : installMode === "powershell"
            ? `$env:Path = "${outputInstallDir};" + $env:Path`
            : `set "PATH=${outputInstallDir};%PATH%"`;
      const verificationCommand =
        installMode === "powershell"
          ? `& "${outputInstalledBinary}" --version`
          : `"${outputInstalledBinary}" --version`;
      expect(printedLines).toContain(pathCommand);
      expect(printedLines).toContain(verificationCommand);
      // Execute only the expected commands after matching the printed lines.
      // Script files keep cmd/PowerShell command syntax out of process argv quoting.
      for (const command of [`${pathCommand}\naxm --version`, verificationCommand]) {
        const scriptName = `printed-guidance.${installMode === "bash" ? "sh" : installMode === "powershell" ? "ps1" : "cmd"}`;
        const scriptPath = path.join(temp.path, scriptName);
        const scriptContent =
          installMode === "cmd"
            ? `@echo off\r\n${command.replaceAll("\n", "\r\n")}\r\nexit /b %errorlevel%\r\n`
            : installMode === "powershell"
              ? `$ErrorActionPreference = 'Stop'\n${command}\nexit $LASTEXITCODE\n`
              : `${command}\n`;
        fs.writeFileSync(scriptPath, scriptContent);
        const observation =
          installMode === "bash"
            ? await runCommand("sh", [scriptName], {
                cwd: temp.path,
                env: createBashEnv(temp.path, options),
              })
            : installMode === "powershell"
              ? await runCommand(
                  "powershell",
                  ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptName],
                  {
                    cwd: temp.path,
                    env: createWindowsEnv(temp.path, options),
                  },
                )
              : await runCommand("cmd", ["/d", "/c", scriptName], {
                  cwd: temp.path,
                  env: createWindowsEnv(temp.path, options),
                });
        expectCommandSuccess(`Printed ${installMode} command`, observation);
        expect(observation.stdout.trim()).toBe(fixtureVersion);
      }

      // This sentinel records current behavior; it is not all-shell profile evidence.
      expect(fs.readFileSync(profilePath, "utf-8")).toBe(profileContent);
      await verifyInstalledBinary(installedBinary);
    } finally {
      temp.cleanup();
    }
  });

  it(`preserves a working axm on ${installMode} checksum failure`, async () => {
    const temp = createTempDir();
    const sourceBinary = resolveHostBinaryPath();
    const installedBinary = path.join(
      temp.path,
      ".axm",
      "bin",
      process.platform === "win32" ? "axm.exe" : "axm",
    );
    try {
      fs.mkdirSync(path.dirname(installedBinary), { recursive: true });
      fs.copyFileSync(sourceBinary, installedBinary);
      if (process.platform !== "win32") fs.chmodSync(installedBinary, 0o755);
      const before = crypto
        .createHash("sha256")
        .update(fs.readFileSync(installedBinary))
        .digest("hex");
      const versionResult = await createBinaryRunner(installedBinary)(["--version"]);
      expectCommandSuccess("existing installed binary", versionResult);
      const version = versionResult.stdout.trim();
      const badBaseUrl = serverContext.baseUrl.replace(
        "/releases/latest/download",
        "/releases/bad/download",
      );

      const requestOffset = serverContext.requests.length;
      const result =
        installMode === "bash"
          ? await runCommand("sh", [path.join(repoRoot, "install.sh")], {
              cwd: repoRoot,
              env: createBashEnv(temp.path, { baseUrl: badBaseUrl, version }),
            })
          : installMode === "powershell"
            ? await runCommand(
                "powershell",
                [
                  "-NoProfile",
                  "-ExecutionPolicy",
                  "Bypass",
                  "-File",
                  path.join(repoRoot, "install.ps1"),
                ],
                {
                  cwd: repoRoot,
                  env: createWindowsEnv(temp.path, { baseUrl: badBaseUrl, version }),
                },
              )
            : await runCommand("cmd", ["/c", path.join(repoRoot, "install.cmd")], {
                cwd: repoRoot,
                env: createWindowsEnv(temp.path, { baseUrl: badBaseUrl, version }),
              });

      expect(result.exitCode).not.toBe(0);
      expect(getOutput(result)).toMatch(/checksum mismatch/iu);
      const requests = serverContext.requests.slice(requestOffset);
      expect(requests).toContain(`/releases/bad/download/${path.basename(sourceBinary)}`);
      expect(requests).toContain("/releases/bad/download/SHA256SUMS");
      const after = crypto
        .createHash("sha256")
        .update(fs.readFileSync(installedBinary))
        .digest("hex");
      expect(after).toBe(before);
      const preserved = await createBinaryRunner(installedBinary)(["--version"]);
      expectCommandSuccess("preserved installed binary", preserved);
      expect(preserved.stdout.trim()).toBe(version);
      expect(fs.existsSync(`${installedBinary}.upgrade.lock`)).toBe(false);
      expect(
        fs.readdirSync(path.dirname(installedBinary)).filter((name) => name.startsWith(".axm-")),
      ).toEqual([]);
    } finally {
      temp.cleanup();
    }
  });
});

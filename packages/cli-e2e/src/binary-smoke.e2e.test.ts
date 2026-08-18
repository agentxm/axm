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

const writeJson = (filePath: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
};

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
    expect(getOutput(result)).toContain("EXTENSIONS");
  });

  it("exposes the complete Knowledge concept-discovery surface", async () => {
    const result = await runBinary(["knowledge", "concepts", "--help"]);

    expect(result.exitCode, getOutput(result)).toBe(0);
    for (const command of ["resolve", "search", "query", "get", "related", "status"]) {
      expect(getOutput(result)).toContain(command);
    }
  });

  it("returns deterministic Knowledge identities and ordering through the compiled binary", async () => {
    const temp = createTempDir();
    const environment = {
      AXM_USER_HOME: temp.path,
      HOME: temp.path,
      USERPROFILE: temp.path,
    };
    try {
      const sourceRoot = path.join(temp.path, "knowledge-source");
      writeJson(path.join(sourceRoot, "knowledge.json"), {
        owner: "@acme",
        type: "knowledge",
        name: "platform",
        version: "1.0.0",
        description: "Portable discovery fixture.",
        format: { name: "okf", version: "0.2" },
        bundleRoot: "src",
      });
      fs.mkdirSync(path.join(sourceRoot, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(sourceRoot, "src", "index.md"),
        '---\nokf_version: "0.2"\n---\n# Platform\n',
      );
      for (const [id, title] of [
        ["alpha", "Alpha"],
        ["beta", "Beta"],
      ]) {
        fs.writeFileSync(
          path.join(sourceRoot, "src", `${id}.md`),
          `---\ntype: reference\ndescription: ${title} concept\n---\n# ${title}\n`,
        );
      }
      const setup = await runBinary(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
        {
          cwd: temp.path,
          env: environment,
        },
      );
      expect(setup.exitCode, getOutput(setup)).toBe(0);
      const settingsPath = path.join(temp.path, ".axm", "settings.json");
      writeJson(settingsPath, {
        agents: [],
        knowledge: { platform: { source: "./knowledge-source", enabled: true } },
      });
      const install = await runBinary(["knowledge", "install", "--yes", "--non-interactive"], {
        cwd: temp.path,
        env: environment,
      });
      expect(install.exitCode, getOutput(install)).toBe(0);
      const query = await runBinary(["knowledge", "concepts", "query", "--json"], {
        cwd: temp.path,
        env: environment,
      });
      expect(query.exitCode, getOutput(query)).toBe(0);
      const document = JSON.parse(query.stdout);
      expect(
        document.result.items.map((item: { ref: { conceptId: string } }) => item.ref.conceptId),
      ).toEqual(["alpha", "beta"]);
      expect(document.result.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ref: expect.objectContaining({
              bundle: "@acme/knowledge/platform",
              bundleVersion: "1.0.0",
              contentRevision: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
            }),
          }),
        ]),
      );
    } finally {
      temp.cleanup();
    }
  });

  it("lists cross-type workspace inventory through the compiled binary", async () => {
    const temp = createTempDir();

    try {
      const axmDir = path.join(temp.path, ".axm");
      fs.mkdirSync(axmDir, { recursive: true });
      fs.writeFileSync(
        path.join(axmDir, "settings.json"),
        JSON.stringify({
          agents: [],
          skills: { review: "@acme/skills/review" },
          hooks: { audit: "@acme/hooks/audit" },
        }),
      );

      const result = await runBinary(["list", "--json"], { cwd: temp.path });

      expect(result.exitCode, getOutput(result)).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        result: {
          filter: "all",
          count: 2,
          totalCount: 2,
          items: [
            { type: "hook", name: "audit" },
            { type: "skill", name: "review" },
          ],
        },
      });
    } finally {
      temp.cleanup();
    }
  });

  it("does not retain the retired root outdated command", async () => {
    const result = await runBinary(["outdated"]);

    expect(result.exitCode).not.toBe(0);
    expect(getOutput(result)).toContain("outdated");
  });

  it("exits non-zero for root token without credentials", async () => {
    const temp = createTempDir();

    try {
      const result = await runBinary(["token"], {
        env: {
          AXM_TOKEN: "",
          AXM_TOKEN_FILE: "",
          HOME: temp.path,
          USERPROFILE: temp.path,
        },
      });

      expect(result.exitCode).toBe(13);
      expect(getOutput(result)).toContain("(auth_required)");
      expect(getOutput(result)).toContain("axm login --device-code --json");
    } finally {
      temp.cleanup();
    }
  });

  it("does not retain the retired auth command group", async () => {
    const result = await runBinary(["auth"]);

    expect(result.exitCode).not.toBe(0);
    expect(getOutput(result)).toContain("auth");
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

import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createTempDir, runCli } from "./utils.js";

interface ReleaseServer {
  readonly url: string;
  readonly close: () => Promise<void>;
}

const servers: Array<ReleaseServer> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

const platformBinaryName = (): string => {
  if (process.platform === "darwin" && process.arch === "arm64") return "axm-darwin-arm64";
  if (process.platform === "darwin" && process.arch === "x64") return "axm-darwin-x64";
  if (process.platform === "linux" && process.arch === "arm64") return "axm-linux-arm64";
  if (process.platform === "linux" && process.arch === "x64") return "axm-linux-x64";
  return "axm-windows-x64.exe";
};

const serveRelease = async (version: string): Promise<ReleaseServer> => {
  const server = http.createServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify([
        {
          tag_name: `cli-v${version}`,
          draft: false,
          prerelease: false,
          assets: [
            {
              name: platformBinaryName(),
              browser_download_url: `https://assets.test/cli-v${version}/${platformBinaryName()}`,
            },
            {
              name: "SHA256SUMS",
              browser_download_url: `https://assets.test/cli-v${version}/SHA256SUMS`,
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
    throw new Error("Release fixture did not expose a TCP address");
  }
  const fixture = {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  } satisfies ReleaseServer;
  servers.push(fixture);
  return fixture;
};

const writeExecutable = (filePath: string, content: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, { mode: 0o755 });
};

describe("Homebrew upgrade convergence", () => {
  it.skipIf(process.platform === "win32")(
    "recovers an exit-0 unchanged upgrade and verifies both installed identities",
    async () => {
      const fixture = createTempDir();
      try {
        const versionResult = await runCli(["--version"]);
        expect(versionResult.exitCode, versionResult.stderr).toBe(0);
        const localVersion = versionResult.stdout.trim();
        const localMajor = /^(\d+)\./u.exec(localVersion)?.[1];
        if (localMajor === undefined) throw new Error(`Invalid built CLI version: ${localVersion}`);
        const targetVersion = `${String(Number(localMajor) + 1)}.0.0`;
        const release = await serveRelease(targetVersion);

        const fakeBin = path.join(fixture.path, "bin");
        const brewPrefix = path.join(fixture.path, "homebrew");
        const statePath = path.join(fixture.path, "installed-version");
        const logPath = path.join(fixture.path, "brew.log");
        fs.writeFileSync(statePath, `${localVersion}\n`);
        const axmFixture = '#!/bin/sh\ncat "$AXM_E2E_STATE"\n';
        writeExecutable(path.join(fakeBin, "axm"), axmFixture);
        writeExecutable(path.join(brewPrefix, "bin", "axm"), axmFixture);
        writeExecutable(
          path.join(fakeBin, "brew"),
          `#!/bin/sh
printf '%s\\n' "$*" >> "$AXM_E2E_LOG"
case "$1" in
  tap) printf '%s\\n' 'agentxm/tap' ;;
  update) ;;
  info) printf '{"formulae":[{"full_name":"agentxm/tap/axm","versions":{"stable":"%s"}}]}\\n' "$AXM_E2E_TARGET" ;;
  --prefix) printf '%s\\n' "$AXM_E2E_PREFIX" ;;
  upgrade) ;;
  reinstall) printf '%s\\n' "$AXM_E2E_TARGET" > "$AXM_E2E_STATE" ;;
  *) exit 1 ;;
esac
`,
        );
        const metadataDir = path.join(fixture.path, ".axm");
        fs.mkdirSync(metadataDir, { recursive: true });
        fs.writeFileSync(
          path.join(metadataDir, "install-meta.json"),
          JSON.stringify({
            schemaVersion: 2,
            method: "homebrew",
            installedAt: "2026-08-12T00:00:00.000Z",
            executablePath: path.join(brewPrefix, "Cellar", "axm", localVersion, "bin", "axm"),
          }),
        );

        const result = await runCli(["upgrade", "--json"], {
          env: {
            HOME: fixture.path,
            AXM_USER_HOME: fixture.path,
            PATH: `${fakeBin}${path.delimiter}${process.env["PATH"] ?? ""}`,
            AXM_UPGRADE_GITHUB_API_URL: release.url,
            AXM_E2E_STATE: statePath,
            AXM_E2E_LOG: logPath,
            AXM_E2E_TARGET: targetVersion,
            AXM_E2E_PREFIX: brewPrefix,
            npm_config_user_agent: "",
          },
        });

        expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0);
        const document: unknown = JSON.parse(result.stdout);
        expect(document).toMatchObject({
          ok: true,
          result: {
            resultStatus: "upgraded",
            installMethod: "homebrew",
            targetVersion,
            reportedVersion: targetVersion,
            verification: "verified",
            mutationState: "updated",
            recommendedCommand: null,
            executablePath: path.join(brewPrefix, "bin", "axm"),
            verificationExecutables: expect.arrayContaining([
              expect.objectContaining({ role: "manager-owned", phase: "pre-mutation" }),
              expect.objectContaining({ role: "path-resolved", phase: "post-primary" }),
              expect.objectContaining({ role: "manager-owned", phase: "post-fallback" }),
              expect.objectContaining({
                role: "path-resolved",
                phase: "post-fallback",
                reportedVersion: targetVersion,
              }),
            ]),
          },
        });
        expect(fs.readFileSync(logPath, "utf8").split("\n")).toEqual(
          expect.arrayContaining(["upgrade agentxm/tap/axm", "reinstall agentxm/tap/axm"]),
        );
        expect(
          JSON.parse(fs.readFileSync(path.join(metadataDir, "install-meta.json"), "utf8")),
        ).toMatchObject({
          method: "homebrew",
          executablePath: path.join(brewPrefix, "bin", "axm"),
        });
      } finally {
        fixture.cleanup();
      }
    },
  );
});

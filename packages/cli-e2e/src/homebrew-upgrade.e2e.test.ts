import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { createTempDir, runCli } from "./utils.js";

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

        const result = await runCli(["upgrade", targetVersion, "--json"], {
          env: {
            HOME: fixture.path,
            AXM_USER_HOME: fixture.path,
            PATH: `${fakeBin}${path.delimiter}${process.env["PATH"] ?? ""}`,
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
            contract: "axm.upgrade-assessment/v1",
            disposition: "upgraded",
            ownership: {
              method: "homebrew",
              executablePath: path.join(brewPrefix, "bin", "axm"),
            },
            target: { version: targetVersion },
            mutation: { state: "updated" },
            recovery: { recommendedCommand: null },
            verification: {
              state: "verified",
              reportedVersion: targetVersion,
              executables: expect.arrayContaining([
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

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const verifier = fileURLToPath(new URL("./verify-installed-package.ts", import.meta.url));

describe("published package verification outside the workspace", () => {
  it.each([
    { version: "1.2.3", stderr: "", succeeds: true },
    { version: "1.2.4", stderr: "", succeeds: false },
    { version: "1.2.3", stderr: "unexpected warning", succeeds: false },
  ])("checks the installed executable: $version / $stderr", (scenario) => {
    const root = mkdtempSync(join(tmpdir(), "axm package verifier "));
    const bin = join(root, "manager bin");
    mkdirSync(bin);
    const windows = process.platform === "win32";
    try {
      // Like npm.cmd, this launcher must find a sibling JS entrypoint even
      // when the verifier runs it from an unrelated temporary directory.
      writeFileSync(
        join(bin, windows ? "npm.cmd" : "npm"),
        windows
          ? '@echo off\r\nnode "%~dp0manager.cjs" %*\r\n'
          : '#!/bin/sh\nexec node "$(dirname "$0")/manager.cjs" "$@"\n',
        { mode: 0o755 },
      );
      writeFileSync(
        join(bin, "manager.cjs"),
        `const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const args = process.argv.slice(2);
if (args.length !== 5 || args[0] !== "install" || args[1] !== "--global" ||
    args[2] !== "--prefix" || args[4] !== "axm.sh@1.2.3") {
  throw new Error("Unexpected package installation arguments");
}
const bin = process.platform === "win32" ? args[3] : join(args[3], "bin");
mkdirSync(bin, { recursive: true });
writeFileSync(join(bin, "installed.cjs"), ${JSON.stringify(`if (process.argv[2] !== "--version") throw new Error("Unexpected executable arguments");
process.stdout.write(${JSON.stringify(scenario.version)} + "\\n");
process.stderr.write(${JSON.stringify(scenario.stderr)});`)});
writeFileSync(join(bin, process.platform === "win32" ? "axm.cmd" : "axm"),
  process.platform === "win32"
    ? '@echo off\\r\\nnode "%~dp0installed.cjs" %*\\r\\n'
    : '#!/bin/sh\\nexec node "$(dirname "$0")/installed.cjs" "$@"\\n',
  { mode: 0o755 });
`,
      );
      const env = { ...process.env };
      // Windows environment keys are case-insensitive; retain one PATH spelling.
      const inheritedPath = Object.entries(env).find(([key]) => key.toLowerCase() === "path")?.[1];
      for (const key of Object.keys(env)) {
        if (key.toLowerCase() === "path") delete env[key];
      }
      env["PATH"] = `${bin}${delimiter}${inheritedPath ?? ""}`;
      const result = spawnSync("bun", [verifier, "npm", "1.2.3"], {
        env,
        encoding: "utf8",
        timeout: 20_000,
      });
      expect(result.error).toBeUndefined();
      if (scenario.succeeds) {
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain("Verified published axm.sh@1.2.3 installed by npm");
      } else {
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain(
          "executable did not report exactly 1.2.3 with empty stderr",
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

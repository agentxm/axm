import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCliRunner, runCommand } from "./runner.js";

describe("CLI runtime isolation", () => {
  afterEach(() => vi.unstubAllEnvs());

  // This fixture models a POSIX version-manager shim; it needs no installed Bun.
  it.skipIf(process.platform === "win32")(
    "resolves the parent runtime before isolating HOME and preserves both child channels",
    async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-runtime-isolation-"));
      try {
        const bin = path.join(root, "bin");
        const parentHome = path.join(root, "parent-home");
        const isolatedHome = path.join(root, "isolated-home");
        for (const directory of [bin, parentHome, isolatedHome]) fs.mkdirSync(directory);
        fs.symlinkSync(process.execPath, path.join(bin, "node"));

        const runtime = path.join(bin, "fixture-bun-runtime");
        fs.writeFileSync(
          runtime,
          `#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const [verb, artifact, ...args] = process.argv.slice(2);
if (verb !== "run" || artifact === undefined) process.exit(91);
const child = spawnSync(process.execPath, [artifact, ...args], {
  env: process.env,
  stdio: "inherit",
});
process.exitCode = child.status ?? 92;
`,
          { mode: 0o755 },
        );
        fs.writeFileSync(
          path.join(bin, "bun"),
          `#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
if (process.env.HOME !== ${JSON.stringify(parentHome)}) {
  process.stderr.write("mise bun@fixture bootstrapped inside isolated HOME\\n");
}
if (process.argv[2] === "--print" && process.argv[3] === "process.execPath") {
  process.stdout.write(${JSON.stringify(runtime)} + "\\n");
} else {
  const child = spawnSync(${JSON.stringify(runtime)}, process.argv.slice(2), {
    env: process.env,
    stdio: "inherit",
  });
  process.exitCode = child.status ?? 93;
}
`,
          { mode: 0o755 },
        );
        const artifact = path.join(root, "fixture-cli.cjs");
        fs.writeFileSync(
          artifact,
          `process.stdout.write(JSON.stringify({ home: process.env.HOME, args: process.argv.slice(2) }) + "\\n");
process.stderr.write(JSON.stringify({ diagnostic: "actual child stderr" }) + "\\n");
process.exitCode = 7;
`,
        );
        vi.stubEnv("HOME", parentHome);
        vi.stubEnv("PATH", bin);
        const options = { cwd: root, env: { HOME: isolatedHome }, timeout: 10_000 };

        // Establish the original defect through a real child, not a mocked call.
        const throughShim = await runCommand("bun", ["run", artifact, "--json"], options);
        expect(throughShim.exitCode).toBe(7);
        expect(throughShim.stderr.split("\n")[0]).toBe(
          "mise bun@fixture bootstrapped inside isolated HOME",
        );

        const runCli = createCliRunner(artifact);
        const result = await runCli(["--json"], options);
        expect(result.exitCode).toBe(7);
        expect(result.stdout).toBe(JSON.stringify({ home: isolatedHome, args: ["--json"] }));
        expect(result.stderr).toBe(JSON.stringify({ diagnostic: "actual child stderr" }));
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
  );
});

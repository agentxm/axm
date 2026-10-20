import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const hook = resolve(import.meta.dirname, "check-staged.checks.sh");
const roots: string[] = [];
const checks = [
  "exec lint-staged --no-stash",
  "axm:local lint --staged --strict",
  "exec nx run axm:scan-secrets:staged",
];

// The shared staged gate runs this hook after isolating the index. A recording
// pnpm stands in for the real tools so only the hook's own contract is observed.
const runHook = (failing?: string) => {
  const root = mkdtempSync(join(tmpdir(), "staged-checks-"));
  roots.push(root);
  mkdirSync(join(root, "bin"));
  writeFileSync(
    join(root, "bin/pnpm"),
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$CHECK_LOG"
if [[ -n "\${FAIL_CHECK:-}" && "$*" == *"$FAIL_CHECK"* ]]; then exit 23; fi
`,
    { mode: 0o755 },
  );
  const result = spawnSync("bash", [hook], {
    cwd: root,
    env: {
      ...process.env,
      CHECK_LOG: join(root, "checks.log"),
      FAIL_CHECK: failing ?? "",
      PATH: `${join(root, "bin")}:${process.env["PATH"]}`,
    },
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  const commands = readFileSync(join(root, "checks.log"), "utf8").trimEnd().split("\n");
  return { status: result.status, commands };
};

const enforced = (command: string) => `--config.verify-deps-before-run=error ${command}`;

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("repository staged checks", () => {
  it("runs the auto-fixes, staged lint, and secrets scan in order against installed dependencies", () => {
    const { status, commands } = runHook();
    expect(status).toBe(0);
    expect(commands).toEqual(checks.map(enforced));
  });

  it.each(checks.map((command, index) => [command, index] as const))(
    "stops at a failing %s check",
    (command, index) => {
      const { status, commands } = runHook(command);
      expect(status).not.toBe(0);
      expect(commands).toEqual(checks.slice(0, index + 1).map(enforced));
    },
  );
});

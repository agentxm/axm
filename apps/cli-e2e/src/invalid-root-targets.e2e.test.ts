import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "./e2e/utils.js";

const snapshot = (root: string): Readonly<Record<string, string>> => {
  const result: Record<string, string> = {};
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile())
        result[path.relative(root, absolute)] = fs.readFileSync(absolute, "utf8");
      else result[path.relative(root, absolute)] = `symlink:${fs.readlinkSync(absolute)}`;
    }
  };
  visit(root);
  return result;
};

describe("invalid root lifecycle targets", () => {
  it.each(["install", "update", "uninstall"])(
    "refuses unsupported targets before %s changes workspace state",
    async (command) => {
      const workspace = createTempDir();
      try {
        const setup = await runCli(
          ["setup", "--yes", "--scope", "project", "--agent", "claude-code"],
          { cwd: workspace.path },
        );
        expect(setup.exitCode).toBe(0);
        const before = snapshot(workspace.path);
        for (const input of [
          "@acme/widgets/example",
          "@acme/libraries/former-name",
          "lib_00000000000000000000000000",
        ]) {
          const result = await runCli([command, input], { cwd: workspace.path });
          expect(result.exitCode).not.toBe(0);
          expect(snapshot(workspace.path)).toEqual(before);
        }
      } finally {
        workspace.cleanup();
      }
    },
  );
});

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "../../../e2e/utils.js";

const writeCommand = (root: string, name: string): void => {
  const commandDir = path.join(root, ".claude", "commands", name);
  fs.mkdirSync(commandDir, { recursive: true });
  fs.writeFileSync(path.join(commandDir, `${name}.md`), `# ${name}\n`);
};

describe("axm commands list inventory", () => {
  it("inventories every unmanaged command", async () => {
    const temp = createTempDir();
    try {
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      writeCommand(temp.path, "manual");
      writeCommand(temp.path, "local-build");

      const result = await runCli(["commands", "list", "--json"], { cwd: temp.path });

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          ok: true,
          result: expect.objectContaining({
            unmanagedCount: 2,
            items: expect.arrayContaining([
              expect.objectContaining({ name: "manual" }),
              expect.objectContaining({ name: "local-build" }),
            ]),
          }),
        }),
      );
    } finally {
      temp.cleanup();
    }
  });
});

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
  it("inventories unmanaged commands and includes ignored commands through the ls alias", async () => {
    const temp = createTempDir();
    try {
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      const settingsPath = path.join(temp.path, ".axm", "settings.json");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      settings.commandsConfig = { ignore: ["local-*"] };
      fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
      writeCommand(temp.path, "manual");
      writeCommand(temp.path, "local-build");

      const normal = await runCli(["commands", "list", "--json"], { cwd: temp.path });
      const included = await runCli(["commands", "ls", "--include-ignored", "--json"], {
        cwd: temp.path,
      });

      expect(normal.exitCode).toBe(0);
      expect(JSON.parse(normal.stdout)).toEqual(
        expect.objectContaining({
          unmanagedCount: 1,
          ignoredCount: 0,
          items: [
            expect.objectContaining({
              name: "manual",
              classification: { kind: "lifecycle", lifecycle: "unmanaged" },
            }),
          ],
        }),
      );
      expect(included.exitCode).toBe(0);
      expect(JSON.parse(included.stdout)).toEqual(
        expect.objectContaining({
          unmanagedCount: 1,
          ignoredCount: 1,
          items: expect.arrayContaining([
            expect.objectContaining({
              name: "local-build",
              classification: expect.objectContaining({
                kind: "ignored",
                matchedBy: ["local-*"],
              }),
            }),
          ]),
        }),
      );
    } finally {
      temp.cleanup();
    }
  });
});

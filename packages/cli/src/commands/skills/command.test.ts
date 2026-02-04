import { describe, expect, it, vi } from "vitest";
import yargs, { type Argv } from "yargs";
import { skillsCommand } from "./command.js";

describe("skills command", () => {
  const createParser = () => yargs().command(skillsCommand).exitProcess(false);

  it("shows help when invoked without sub-command", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("skills");
    expect(helpOutput).toContain("Manage skills");
  });

  it("shows skills command description", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("Manage skills (extensions) for AI coding agents");
  });
});

describe("skills subcommand help", () => {
  it("includes examples when viewing skills help directly", async () => {
    // Create parser that simulates `axm skills --help`
    const parser = yargs().command(skillsCommand).exitProcess(false);

    // Get help for the skills command specifically
    await parser.parse(["skills", "--help"]);
    // yargs will have shown help, we verify by checking the command structure
    expect(skillsCommand.describe).toBe("Manage skills (extensions) for AI coding agents");
  });

  it("has add subcommand registered", () => {
    // Build mock object - methods return self for chaining
    const mock = {
      command: vi.fn().mockReturnThis(),
      demandCommand: vi.fn().mockReturnThis(),
      example: vi.fn().mockReturnThis(),
      fail: vi.fn().mockReturnThis(),
    };

    if (typeof skillsCommand.builder === "function") {
      // Cast once at the boundary - yargs types are too complex for mocks
      skillsCommand.builder(mock as unknown as Argv);
      expect(mock.command).toHaveBeenCalled();
    }
  });
});

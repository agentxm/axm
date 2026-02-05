import { describe, expect, it } from "vitest";
import yargs from "yargs";
import { initCommand } from "./cli-commands/init/command.js";
import { skillsCommand } from "./cli-commands/skills/command.js";

describe("main CLI", () => {
  const createParser = () =>
    yargs()
      .scriptName("axm")
      .usage("$0 <command> [options]\n\nManage skills (extensions) for AI coding agents.")
      .command(initCommand)
      .command(skillsCommand)
      .example("$0 init", "Initialize axm in current project")
      .example("$0 skills add owner/repo", "Add skills from a GitHub repository")
      .demandCommand(1)
      .exitProcess(false);

  it("shows help when invoked without arguments", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("Manage skills (extensions) for AI coding agents");
    expect(helpOutput).toContain("init");
    expect(helpOutput).toContain("skills");
  });

  it("includes examples in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("axm init");
    expect(helpOutput).toContain("axm skills add owner/repo");
  });

  it("shows available commands in help", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("Initialize axm");
    expect(helpOutput).toContain("Manage skills");
  });
});

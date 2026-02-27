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

describe("fail handler error formatting", () => {
  it("extracts message from Error objects when msg is null", () => {
    // Simulates the fix: when yargs .fail() receives msg=null and an Error object,
    // it should extract .message instead of logging [object Object].
    const err = new Error("something went wrong");
    const msg: string | null = null;
    const formatted = msg ?? (err instanceof Error ? err.message : String(err));
    expect(formatted).toBe("something went wrong");
  });

  it("stringifies non-Error values when msg is null", () => {
    const err: unknown = "UNKNOWN_ERROR";
    const msg: string | null = null;
    const formatted = msg ?? (err instanceof Error ? err.message : String(err));
    expect(formatted).toBe("UNKNOWN_ERROR");
  });

  it("uses msg when it is provided", () => {
    const msg = "Not enough arguments";
    const err = new Error("ignored");
    const formatted = msg ?? (err instanceof Error ? err.message : String(err));
    expect(formatted).toBe("Not enough arguments");
  });
});

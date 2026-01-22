import { describe, expect, it } from "vitest";
import yargs from "yargs";
import { extensionsCommand } from "./extensions.js";

describe("extensions command", () => {
  const createParser = () => yargs().command(extensionsCommand).exitProcess(false).fail(false);

  it("requires a sub-command", () => {
    expect(() => createParser().parse("extensions")).toThrow(
      /Please specify a sub-command for extensions/,
    );
  });

  it("shows help for extensions", async () => {
    const parser = yargs().command(extensionsCommand).exitProcess(false).fail(false);
    const helpOutput = await parser.getHelp();
    expect(helpOutput).toContain("extensions");
    expect(helpOutput).toContain("Manage extensions");
  });
});

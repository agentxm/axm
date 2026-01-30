/**
 * Unit tests for the skills remove command yargs definition.
 *
 * Tests verify command description and structure.
 * Handler logic is tested separately in handler.test.ts.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it } from "vitest";
import yargs from "yargs";
import { removeCommand } from "./command.js";

describe("skills remove command", () => {
  const createParser = () => yargs().command(removeCommand).exitProcess(false);

  it("exports removeCommand as CommandModule", () => {
    expect(removeCommand).toBeDefined();
    expect(removeCommand.command).toBeDefined();
    expect(removeCommand.describe).toBeDefined();
    expect(removeCommand.handler).toBeDefined();
  });

  it("uses 'remove' as command string", () => {
    expect(removeCommand.command).toBe("remove");
  });

  it("has describe text for help", () => {
    expect(removeCommand.describe).toBeDefined();
    expect(typeof removeCommand.describe).toBe("string");
    expect((removeCommand.describe as string).length).toBeGreaterThan(0);
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("remove");
    expect(helpOutput).toContain("Remove");
  });
});

/**
 * Parser tests verify actual yargs parsing behavior.
 * These tests parse real command-line arguments and verify the parsed result.
 *
 * We create a handler-less version of the command to test parsing without
 * triggering side effects.
 */
describe("skills remove command parser", () => {
  /**
   * Creates a yargs parser configured for testing.
   * - Uses removeCommand.builder for option definitions but no handler
   * - exitProcess(false): Prevents process.exit() on errors
   * - fail(false): Throws errors instead of printing to stderr
   */
  const createParser = () =>
    yargs()
      .command({
        command: removeCommand.command,
        describe: removeCommand.describe,
        builder: removeCommand.builder,
        handler: () => {}, // No-op handler - we only want to test parsing
      })
      .exitProcess(false)
      .fail(false);

  it("parses remove command without arguments", async () => {
    const argv = await createParser().parse(["remove"]);

    expect(argv._).toContain("remove");
  });
});

import { describe, expect, it } from "vitest";

import { formatLearnMore } from "../../formatter.js";
import type { JsonHelpDoc } from "../../cli-runtime/index.js";
import { displayWidth, paintText, stripTerminalFormatting } from "../../screen/index.js";
import { commandHelpDoc } from "./command-help-view.js";

const ESCAPE = "\u001b";

const makeHelpDoc = (overrides: Partial<JsonHelpDoc> = {}): JsonHelpDoc => ({
  type: "help",
  description: "",
  usage: "axm [flags]",
  flags: [],
  ...overrides,
});

const globalFlags = [
  { name: "verbose", aliases: [], type: "boolean", required: false },
  { name: "json", aliases: [], type: "boolean", required: false },
];

/** The help as a pipe receives it: plain, at natural width. */
const plainHelp = (doc: JsonHelpDoc): string =>
  paintText(commandHelpDoc(doc), { width: "unbounded", colors: false }).join("\n");

const styledHelp = (doc: JsonHelpDoc, width: number): string =>
  paintText(commandHelpDoc(doc), { width, colors: true }).join("\n");

describe("root help view", () => {
  const rootDoc = makeHelpDoc({
    usage: "axm <subcommand> [flags]",
    subcommands: [
      {
        group: "MANAGE EXTENSIONS",
        commands: [{ name: "mcps", alias: "mcps", shortDescription: "MCP servers" }],
      },
      {
        group: "GETTING STARTED",
        commands: [
          { name: "help", shortDescription: "Help" },
          { name: "setup", shortDescription: "Set up" },
        ],
      },
      { group: "AUTH", commands: [{ name: "login", shortDescription: "Log in" }] },
    ],
    globalFlags,
  });

  it("opens with the masthead, usage, and the registered groups in order", () => {
    const output = plainHelp(rootDoc);

    expect(output).toContain("▄▀█ ▀▄▀ █▀▄▀█");
    expect(output).toContain("Agent Extension Manager by AgentXM");
    expect(output).toMatch(/USAGE\n\s+axm <command> \[flags\]/u);
    expect(output).toMatch(/START HERE\n\s+help\s+Help\n\s+setup\s+Set up/u);
    expect(output).toMatch(/MANAGE EXTENSIONS\n\s+mcps, mcps\s+MCP servers/u);
    expect(output).toMatch(/AUTH\n\s+login$/mu);
    expect(output).toMatch(/GLOBAL FLAGS\n\s+--verbose, --json\n\s+Run axm <command> --help/u);
    expect(output.indexOf("USAGE")).toBeLessThan(output.indexOf("START HERE"));
    expect(output.indexOf("START HERE")).toBeLessThan(output.indexOf("MANAGE EXTENSIONS"));
    expect(output.indexOf("AUTH")).toBeLessThan(output.indexOf("GLOBAL FLAGS"));
    expect(output).not.toContain("DESCRIPTION");
    expect(output).not.toContain("EXAMPLES");
    expect(output).not.toContain(ESCAPE);
  });

  it("names global flags without describing them twice", () => {
    const output = plainHelp(
      makeHelpDoc({
        globalFlags: [
          {
            name: "quiet",
            aliases: [],
            type: "boolean",
            required: false,
            description: "Show only final outcomes, errors, and required actions",
          },
        ],
      }),
    );

    expect(output).toMatch(
      /GLOBAL FLAGS\n\s+--quiet\n\s+Run axm <command> --help for flag details/u,
    );
    expect(output).not.toContain("Show only final outcomes, errors, and required actions");
  });

  it("renders a compact group as a name list closed by its footer", () => {
    const output = plainHelp(
      makeHelpDoc({
        subcommands: [
          {
            group: "EXTENSION TYPES",
            commands: [
              { name: "skills", shortDescription: "Manage skills" },
              { name: "packs", shortDescription: "Manage packs" },
            ],
          },
          {
            group: "CLI",
            commands: [
              { name: "cache", shortDescription: "Cache" },
              { name: "upgrade", shortDescription: "Upgrade" },
            ],
          },
        ],
        globalFlags,
      }),
    );

    expect(output).toMatch(
      /EXTENSION TYPES\n\s+skills, packs\n\s+Run axm <type> --help for type-specific commands/u,
    );
    expect(output).not.toContain("Manage skills");
    expect(output).toMatch(/CLI\n\s+cache, upgrade\n\nGLOBAL FLAGS/u);
  });

  it("folds an adjacent inverse command into the row of the command it reverses", () => {
    const output = plainHelp(
      makeHelpDoc({
        subcommands: [
          {
            group: "PUBLISHED EXTENSIONS",
            commands: [
              { name: "yank", shortDescription: "Exclude a version" },
              { name: "unyank", shortDescription: "Restore a version" },
            ],
          },
          {
            group: "MANAGE EXTENSIONS",
            commands: [
              { name: "install", shortDescription: "Install" },
              { name: "update", shortDescription: "Update" },
              { name: "uninstall", shortDescription: "Uninstall" },
            ],
          },
        ],
      }),
    );

    expect(output).toMatch(/PUBLISHED EXTENSIONS\n\s+yank, unyank\s+Exclude a version\n/u);
    expect(output).not.toContain("Restore a version");
    expect(output).not.toContain("install, uninstall");
    expect(output).toMatch(/\s+uninstall\s+Uninstall/u);
  });

  it("appends the learn-more footer under its own heading", () => {
    const output = plainHelp(
      makeHelpDoc({
        learnMore: formatLearnMore([
          ["axm help getting-started", "Set up AXM in a new workspace"],
          ["axm knowledge install @ac/knowledge/workspace-baseline", "Install a Knowledge bundle"],
        ]),
      }),
    );

    expect(output).toMatch(
      /LEARN MORE\n\s+axm help getting-started\s+Set up AXM in a new workspace\n\s+axm knowledge install @ac\/knowledge\/workspace-baseline\s+Install a Knowledge bundle$/u,
    );
    expect(plainHelp(makeHelpDoc())).not.toContain("LEARN MORE");
  });

  it("is styled and laid out by the painter", () => {
    const styled = styledHelp(rootDoc, 80);

    expect(styled).toContain(`${ESCAPE}[1mUSAGE${ESCAPE}[0m`);
    expect(styled).toContain(`${ESCAPE}[36maxm <command> [flags]${ESCAPE}[0m`);
    expect(styled).toContain(`${ESCAPE}[36msetup${ESCAPE}[0m`);
    expect(styled).toContain(`${ESCAPE}[32m--json${ESCAPE}[0m`);
    expect(stripTerminalFormatting(styled)).toBe(
      paintText(commandHelpDoc(rootDoc), { width: 80, colors: false }).join("\n"),
    );
  });
});

describe("command help view", () => {
  const commandDoc = makeHelpDoc({
    description: "Install extensions from Registry, Git, or path sources",
    usage: "axm install [<source>] [flags]",
    args: [
      {
        name: "source",
        type: "string",
        required: false,
        variadic: false,
        description: "Registry FQN, Git locator, or path locator",
      },
    ],
    flags: [
      {
        name: "agent",
        aliases: ["a"],
        type: "string",
        required: false,
        description:
          "Restrict the operation to one configured agent, naming it by its stable identifier as listed by axm agents list",
      },
      { name: "all", aliases: [], type: "boolean", required: false, description: "Every one" },
    ],
    globalFlags,
    subcommands: [
      {
        commands: [
          {
            name: "disable",
            shortDescription: "Disable a rule package without removing its authored source",
          },
        ],
      },
    ],
    examples: [
      { command: "axm install @acme/skills/code-review", description: "Add a skill" },
      { command: "axm install" },
    ],
  });

  it("lays the sections out in reference order without the masthead", () => {
    const output = plainHelp(commandDoc);

    expect(output).not.toContain("▄▀█ ▀▄▀ █▀▄▀█");
    expect(output).toMatch(
      /^DESCRIPTION\n\s+Install extensions from Registry, Git, or path sources/u,
    );
    expect(output).toMatch(/USAGE\n\s+axm install \[<source>\] \[flags\]/u);
    expect(output).toMatch(
      /ARGUMENTS\n\s+\[<source>\]\s+Registry FQN, Git locator, or path locator \(optional\)/u,
    );
    expect(output).toMatch(/FLAGS\n\s+--agent, -a\s+Restrict the operation/u);
    expect(output).toMatch(/GLOBAL FLAGS\n\s+--verbose\n\s+--json/u);
    expect(output).toMatch(/SUBCOMMANDS\n\s+disable\s+Disable a rule package/u);
    expect(output).toMatch(
      /authored source\n\nEXAMPLES\n\s+# Add a skill\n\s+axm install @acme\/skills\/code-review\n\n\s+axm install$/u,
    );
    expect(output).not.toContain(ESCAPE);
  });

  it("keeps every description whole on one line when the width is unbounded", () => {
    const lines = plainHelp(commandDoc).split("\n");
    const longest = "Restrict the operation to one configured agent";

    expect(lines.filter((line) => line.includes(longest))).toHaveLength(1);
    expect(lines.filter((line) => line.includes("as listed by axm agents list"))).toHaveLength(1);
    for (const line of lines) expect(line, line).not.toMatch(/\s$/u);
  });

  it("wraps descriptions to the terminal width and never cuts an invocation", () => {
    const width = 60;
    const lines = paintText(commandHelpDoc(commandDoc), { width, colors: false });

    for (const line of lines) {
      if (line.includes("axm install @acme/skills/code-review")) continue;
      expect(displayWidth(line), line).toBeLessThanOrEqual(width);
    }
    expect(lines.some((line) => line.includes("axm install @acme/skills/code-review"))).toBe(true);
    expect(lines.filter((line) => line.includes("Restrict the operation")).length).toBe(1);
    expect(lines.length).toBeGreaterThan(plainHelp(commandDoc).split("\n").length);
  });
});

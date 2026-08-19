import * as Option from "effect/Option";
import * as ServiceMap from "effect/Context";
import { CliError } from "effect/unstable/cli";
import type { HelpDoc } from "effect/unstable/cli/HelpDoc";
import { describe, expect, it } from "vitest";

import { LearnMore, formatLearnMore, makeAxmFormatter } from "./formatter.js";

const makeHelpDoc = (overrides: Partial<HelpDoc> = {}): HelpDoc => ({
  description: "",
  usage: "axm [flags]",
  flags: [],
  annotations: ServiceMap.empty(),
  ...overrides,
});

describe("makeAxmFormatter", () => {
  const formatter = makeAxmFormatter({ colors: false });
  const colorFormatter = makeAxmFormatter({ colors: true });
  const jsonFormatter = makeAxmFormatter({ json: true });
  const globalFlags = [
    {
      name: "verbose",
      aliases: [],
      type: "boolean",
      description: Option.none(),
      required: false,
    },
    {
      name: "json",
      aliases: [],
      type: "boolean",
      description: Option.none(),
      required: false,
    },
  ];

  describe("global flag display", () => {
    it("omits the global flag table from compact root help but lists flag names", () => {
      const doc = makeHelpDoc({
        usage: "axm [flags]",
        globalFlags,
      });
      const output = formatter.formatHelpDoc(doc);
      expect(output).toContain("GLOBAL FLAGS\n  --verbose, --json");
    });

    it("preserves all global flags on subcommand help", () => {
      const doc = makeHelpDoc({
        usage: "axm setup [flags]",
        globalFlags,
      });
      const output = formatter.formatHelpDoc(doc);
      expect(output).toContain("GLOBAL FLAGS");
      expect(output).toContain("--json");
      expect(output).toContain("--verbose");
    });

    it("preserves all global flags on nested subcommand help", () => {
      const doc = makeHelpDoc({
        usage: "axm skills install [flags]",
        globalFlags,
      });
      const output = formatter.formatHelpDoc(doc);
      expect(output).toContain("GLOBAL FLAGS");
      expect(output).toContain("--json");
      expect(output).toContain("--verbose");
    });

    it("describes output-mode guarantees in root help", () => {
      const doc = makeHelpDoc({
        usage: "axm [flags]",
        globalFlags: [
          {
            name: "quiet",
            aliases: [],
            type: "boolean",
            description: Option.some("Show only final outcomes, errors, and required actions"),
            required: false,
          },
        ],
      });
      const output = formatter.formatHelpDoc(doc);

      expect(output).toContain("OUTPUT MODES");
      expect(output).toContain("--quiet Show only final outcomes, errors, and required actions");
    });
  });

  describe("LearnMore footer", () => {
    it("appends footer when LearnMore annotation is present", () => {
      const footerText = "LEARN MORE\n  Visit https://example.com for files.";
      const annotations = ServiceMap.make(LearnMore, footerText);
      const doc = makeHelpDoc({ annotations });
      const output = formatter.formatHelpDoc(doc);
      expect(output).toContain(footerText);
    });

    it("bolds the LEARN MORE heading when colors are enabled", () => {
      const footerText = "LEARN MORE\n  Visit https://example.com for files.";
      const annotations = ServiceMap.make(LearnMore, footerText);
      const doc = makeHelpDoc({ annotations });
      const output = colorFormatter.formatHelpDoc(doc);
      expect(output).toContain("\u001b[1mLEARN MORE\u001b[0m");
      expect(output).toContain("Visit https://example.com for files.");
    });

    it("does not append footer when LearnMore annotation is absent", () => {
      const doc = makeHelpDoc();
      const output = formatter.formatHelpDoc(doc);
      expect(output).not.toContain("LEARN MORE");
    });

    it("does not append footer when LearnMore annotation is empty string", () => {
      const annotations = ServiceMap.make(LearnMore, "");
      const doc = makeHelpDoc({ annotations });
      const output = formatter.formatHelpDoc(doc);
      // The output should end after the standard help sections
      const lines = output.split("\n");
      const lastNonEmpty = lines.filter((l) => l.trim() !== "").pop() ?? "";
      expect(lastNonEmpty).not.toBe("");
    });

    it("puts long learn more commands on their own line", () => {
      const annotations = ServiceMap.make(
        LearnMore,
        formatLearnMore([
          ["axm knowledge install @ac/knowledge/workspace-baseline", "Install a Knowledge bundle"],
        ]),
      );
      const doc = makeHelpDoc({ annotations });
      const output = formatter.formatHelpDoc(doc);

      expect(output).toContain(
        "LEARN MORE\n  axm knowledge install @ac/knowledge/workspace-baseline\n    Install a Knowledge bundle",
      );
    });
  });

  describe("human help rendering", () => {
    it("renders branded root help from the supplied command metadata", () => {
      const doc = makeHelpDoc({
        usage: "axm <subcommand> [flags]",
        subcommands: [
          {
            group: "EXTENSIONS",
            commands: [
              {
                name: "mcps",
                alias: "mcps",
                shortDescription: "MCP servers",
                description: "",
              },
            ],
          },
          {
            group: "GETTING STARTED",
            commands: [
              { name: "help", alias: undefined, shortDescription: "Help", description: "" },
              { name: "setup", alias: undefined, shortDescription: "Set up", description: "" },
            ],
          },
          {
            group: "AUTH",
            commands: [
              { name: "login", alias: undefined, shortDescription: "Log in", description: "" },
            ],
          },
        ],
        globalFlags,
      });
      const output = formatter.formatHelpDoc(doc);
      expect(output).toContain("▄▀█ ▀▄▀ █▀▄▀█");
      expect(output).toContain("USAGE\n  axm <command> [flags]");
      expect(output).toMatch(/EXTENSIONS\n {2}mcps, mcps\s+MCP servers/);
      expect(output).not.toMatch(/^ {2}(commands|files)\b/m);
      expect(output).toMatch(/START HERE\n {2}help\s+Help\n {2}setup\s+Set up/);
      expect(output).toMatch(/AUTH\n {2}login\s+Log in/);
      expect(output).toContain("GLOBAL FLAGS\n  --verbose, --json");
      expect(output).not.toContain("agents");
      expect(output).not.toContain("skills");
      expect(output).not.toContain("outdated");
      expect(output).not.toContain("prune");
      expect(output).not.toContain("All commands:");
      expect(output).not.toContain("COMMON");
      expect(output).not.toContain("More:");
      expect(output).not.toContain("DESCRIPTION");
      expect(output).not.toContain("EXAMPLES");
      expect(output.split("\n").length).toBeLessThanOrEqual(40);
    });

    it("colors root help when colors are enabled", () => {
      const doc = makeHelpDoc({
        usage: "axm <subcommand> [flags]",
        subcommands: [
          {
            group: "AUTH",
            commands: [
              { name: "login", alias: undefined, shortDescription: "Log in", description: "" },
            ],
          },
        ],
        globalFlags,
      });
      const output = colorFormatter.formatHelpDoc(doc);

      expect(output).toContain("\u001b[1mUSAGE\u001b[0m");
      expect(output).toContain("\u001b[36maxm <command> [flags]\u001b[0m");
      expect(output).not.toContain("CORE");
      expect(output).toContain("\u001b[1mAUTH\u001b[0m\n  \u001b[36mlogin\u001b[0m");
      expect(output).toContain("Log in");
      expect(output).toContain("[32m--json[0m");
    });

    it("does not prepend branding to subcommand help", () => {
      const doc = makeHelpDoc({ usage: "axm setup [flags]" });
      const output = formatter.formatHelpDoc(doc);
      expect(output).not.toContain("▄▀█ ▀▄▀ █▀▄▀█");
    });

    it("adds a section break before subcommand examples", () => {
      const doc = makeHelpDoc({
        usage: "axm rules <subcommand> [flags]",
        subcommands: [
          {
            group: undefined,
            commands: [
              {
                name: "disable",
                alias: undefined,
                shortDescription: "Disable a rule package without removing its authored source",
                description: "",
              },
            ],
          },
        ],
        examples: [
          {
            command: "axm rules install @ac/rules/workspace-baseline",
            description: "Install a rule package",
          },
        ],
      });
      const output = formatter.formatHelpDoc(doc);

      expect(output).toContain("authored source\n\nEXAMPLES");
    });

    it("renders Start here above the remaining registered groups", () => {
      const doc = makeHelpDoc({
        usage: "axm [flags]",
        subcommands: [
          {
            group: "GETTING STARTED",
            commands: [
              { name: "setup", alias: undefined, shortDescription: "Initialize", description: "" },
            ],
          },
          {
            group: "AUTH",
            commands: [
              { name: "login", alias: undefined, shortDescription: "Log in", description: "" },
            ],
          },
        ],
        globalFlags,
      });
      const output = formatter.formatHelpDoc(doc);
      const usageIdx = output.indexOf("USAGE");
      const startHereIdx = output.indexOf("START HERE");
      const authIdx = output.indexOf("AUTH");
      const footerIdx = output.indexOf("GLOBAL FLAGS");

      expect(usageIdx).toBeGreaterThan(-1);
      expect(startHereIdx).toBeGreaterThan(-1);
      expect(authIdx).toBeGreaterThan(-1);
      expect(footerIdx).toBeGreaterThan(-1);

      expect(usageIdx).toBeLessThan(startHereIdx);
      expect(startHereIdx).toBeLessThan(authIdx);
      expect(authIdx).toBeLessThan(footerIdx);
    });

    it("renders custom groups in compact root command list", () => {
      const doc = makeHelpDoc({
        usage: "axm [flags]",
        subcommands: [
          {
            group: "CUSTOM SECTION",
            commands: [
              {
                name: "custom",
                alias: undefined,
                shortDescription: "Custom command",
                description: "",
              },
            ],
          },
        ],
        globalFlags,
      });
      const output = formatter.formatHelpDoc(doc);
      expect(output).toMatch(/CUSTOM SECTION\n {2}custom\s+Custom command/);
    });

    it("trims trailing blank lines from sections", () => {
      const doc = makeHelpDoc({
        usage: "axm [flags]",
        globalFlags,
      });
      const output = formatter.formatHelpDoc(doc);
      // Should not end with multiple blank lines
      expect(output).not.toMatch(/\n\n\n$/);
    });
  });

  describe("json mode", () => {
    it("renders human version output without decoration", () => {
      expect(formatter.formatVersion("axm", "1.2.3")).toBe("1.2.3");
    });

    it("serializes help files as plain JSON", () => {
      const footerText = "LEARN MORE\n  Visit https://example.com for files.";
      const annotations = ServiceMap.make(LearnMore, footerText);
      const doc = makeHelpDoc({
        usage: "axm skills install [flags]",
        annotations,
        globalFlags,
        flags: [
          {
            name: "scope",
            aliases: ["s"],
            type: "string",
            description: Option.some("Scope to install into"),
            required: false,
          },
        ],
      });

      const output = JSON.parse(jsonFormatter.formatHelpDoc(doc));
      expect(output).toMatchObject({
        type: "help",
        usage: "axm skills install [flags]",
        learnMore: footerText,
        flags: [
          {
            name: "scope",
            aliases: ["s"],
            type: "string",
            required: false,
            description: "Scope to install into",
          },
        ],
        globalFlags: [
          {
            name: "verbose",
            aliases: [],
            type: "boolean",
            required: false,
          },
          {
            name: "json",
            aliases: [],
            type: "boolean",
            required: false,
          },
        ],
      });
    });

    it("serializes version output as JSON", () => {
      expect(JSON.parse(jsonFormatter.formatVersion("axm", "1.2.3"))).toEqual({
        type: "version",
        name: "axm",
        version: "1.2.3",
      });
    });

    it("serializes parser errors as a usage event", () => {
      const output = JSON.parse(
        jsonFormatter.formatErrors([new CliError.MissingOption({ option: "name" })]),
      );

      expect(output).toEqual({
        type: "error",
        code: "usage",
        message: "Missing required flag: --name",
      });
    });
  });
});

import * as Option from "effect/Option";
import * as ServiceMap from "effect/Context";
import type { HelpDoc } from "effect/unstable/cli/HelpDoc";
import { describe, expect, it } from "vitest";

import { JsonSchemaVersion } from "@agentxm/client-core/unstable/cli-runtime";

import { LearnMore, makeAxmFormatter } from "./formatter.js";

const makeHelpDoc = (overrides: Partial<HelpDoc> = {}): HelpDoc => ({
  description: "",
  usage: "axm [flags]",
  flags: [],
  annotations: ServiceMap.empty(),
  ...overrides,
});

describe("makeAxmFormatter", () => {
  const formatter = makeAxmFormatter();
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

  describe("global flag suppression", () => {
    it("preserves global flags on root command help", () => {
      const doc = makeHelpDoc({
        usage: "axm [flags]",
        globalFlags,
      });
      const output = formatter.formatHelpDoc(doc);
      expect(output).toContain("GLOBAL FLAGS");
    });

    it("preserves only --json on subcommand help", () => {
      const doc = makeHelpDoc({
        usage: "axm setup [flags]",
        globalFlags,
      });
      const output = formatter.formatHelpDoc(doc);
      expect(output).toContain("GLOBAL FLAGS");
      expect(output).toContain("--json");
      expect(output).not.toContain("--verbose");
    });

    it("preserves only --json on nested subcommand help", () => {
      const doc = makeHelpDoc({
        usage: "axm skills install [flags]",
        globalFlags,
      });
      const output = formatter.formatHelpDoc(doc);
      expect(output).toContain("GLOBAL FLAGS");
      expect(output).toContain("--json");
      expect(output).not.toContain("--verbose");
    });
  });

  describe("LearnMore footer", () => {
    it("appends footer when LearnMore annotation is present", () => {
      const footerText = "LEARN MORE\n  Visit https://example.com for docs.";
      const annotations = ServiceMap.make(LearnMore, footerText);
      const doc = makeHelpDoc({ annotations });
      const output = formatter.formatHelpDoc(doc);
      expect(output).toContain(footerText);
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
  });

  describe("root help branding and section reordering", () => {
    it("prepends branding to root help output", () => {
      const doc = makeHelpDoc({ usage: "axm [flags]" });
      const output = formatter.formatHelpDoc(doc);
      expect(output).toContain("▄▀█ ▀▄▀ █▀▄▀█");
      expect(output).toContain("https://axm.sh");
    });

    it("does not prepend branding to subcommand help", () => {
      const doc = makeHelpDoc({ usage: "axm setup [flags]" });
      const output = formatter.formatHelpDoc(doc);
      expect(output).not.toContain("▄▀█ ▀▄▀ █▀▄▀█");
    });

    it("reorders sections to match desired order", () => {
      const doc = makeHelpDoc({
        usage: "axm [flags]",
        subcommands: [
          {
            group: "AUTH",
            commands: [
              { name: "login", alias: undefined, shortDescription: "Log in", description: "" },
            ],
          },
          {
            group: "GETTING STARTED",
            commands: [
              { name: "setup", alias: undefined, shortDescription: "Initialize", description: "" },
            ],
          },
        ],
        globalFlags,
      });
      const output = formatter.formatHelpDoc(doc);
      const usageIdx = output.indexOf("USAGE");
      const gettingStartedIdx = output.indexOf("GETTING STARTED");
      const authIdx = output.indexOf("AUTH:");
      const globalFlagsIdx = output.indexOf("GLOBAL FLAGS");

      expect(usageIdx).toBeGreaterThan(-1);
      expect(gettingStartedIdx).toBeGreaterThan(-1);
      expect(authIdx).toBeGreaterThan(-1);
      expect(globalFlagsIdx).toBeGreaterThan(-1);

      // USAGE before GETTING STARTED before AUTH before GLOBAL FLAGS
      expect(usageIdx).toBeLessThan(gettingStartedIdx);
      expect(gettingStartedIdx).toBeLessThan(authIdx);
      expect(authIdx).toBeLessThan(globalFlagsIdx);
    });

    it("preserves unrecognized sections at the end", () => {
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
      // The custom section should still appear (not be silently dropped)
      expect(output).toContain("CUSTOM SECTION");
      // And it should come after GLOBAL FLAGS
      const globalFlagsIdx = output.indexOf("GLOBAL FLAGS");
      const customIdx = output.indexOf("CUSTOM SECTION");
      expect(customIdx).toBeGreaterThan(globalFlagsIdx);
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

    it("serializes help docs as plain JSON", () => {
      const footerText = "LEARN MORE\n  Visit https://example.com for docs.";
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
        _version: JsonSchemaVersion,
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
        _version: JsonSchemaVersion,
        type: "version",
        name: "axm",
        version: "1.2.3",
      });
    });
  });
});

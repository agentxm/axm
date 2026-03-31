import * as Option from "effect/Option";
import * as ServiceMap from "effect/ServiceMap";
import type { HelpDoc } from "effect/unstable/cli/HelpDoc";
import { describe, expect, it } from "vitest";

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

  describe("global flag suppression", () => {
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

    it("preserves global flags on root command help", () => {
      const doc = makeHelpDoc({
        usage: "axm [flags]",
        globalFlags,
      });
      const output = formatter.formatHelpDoc(doc);
      expect(output).toContain("GLOBAL FLAGS");
    });

    it("suppresses non-json global flags on subcommand help", () => {
      const doc = makeHelpDoc({
        usage: "axm init [flags]",
        globalFlags,
      });
      const output = formatter.formatHelpDoc(doc);
      expect(output).toContain("GLOBAL FLAGS");
      expect(output).toContain("--json");
      expect(output).not.toContain("--verbose");
    });

    it("preserves --json on nested subcommand help", () => {
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
});

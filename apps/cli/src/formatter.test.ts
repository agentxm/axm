import * as Option from "effect/Option";
import * as ServiceMap from "effect/Context";
import type { HelpDoc } from "effect/unstable/cli/HelpDoc";
import { describe, expect, it } from "vitest";

import { LearnMore, formatLearnMore, learnMoreRows, makeAxmFormatter } from "./formatter.js";

const ESCAPE = "\u001b";

const makeHelpDoc = (overrides: Partial<HelpDoc> = {}): HelpDoc => ({
  description: "",
  usage: "axm [flags]",
  flags: [],
  annotations: ServiceMap.empty(),
  ...overrides,
});

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

describe("makeAxmFormatter", () => {
  const formatter = makeAxmFormatter();

  it("emits the machine help document without styling", () => {
    const footerText = "LEARN MORE\n  Visit https://example.com for files.";
    const doc = makeHelpDoc({
      usage: "axm skills install [flags]",
      annotations: ServiceMap.make(LearnMore, footerText),
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

    const output = formatter.formatHelpDoc(doc);
    expect(output).not.toContain(ESCAPE);
    expect(JSON.parse(output)).toMatchObject({
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
        { name: "verbose", aliases: [], type: "boolean", required: false },
        { name: "json", aliases: [], type: "boolean", required: false },
      ],
    });
  });

  it("omits an empty learn-more footer from the help document", () => {
    const doc = makeHelpDoc({ annotations: ServiceMap.make(LearnMore, "") });
    expect(JSON.parse(formatter.formatHelpDoc(doc))).not.toHaveProperty("learnMore");
  });

  it("emits the machine version document", () => {
    expect(JSON.parse(formatter.formatVersion("axm", "1.2.3"))).toEqual({
      type: "version",
      name: "axm",
      version: "1.2.3",
    });
  });
});

describe("learn-more footer", () => {
  it("pads the command column to a consistent width", () => {
    expect(
      formatLearnMore([
        ["axm help skills", "How skill extensions work"],
        ["axm help", "Browse all help topics"],
      ]),
    ).toBe(
      "LEARN MORE\n  axm help skills  How skill extensions work\n  axm help         Browse all help topics",
    );
  });

  it("puts long learn more commands on their own line", () => {
    expect(
      formatLearnMore([
        ["axm knowledge install @ac/knowledge/workspace-baseline", "Install a Knowledge bundle"],
      ]),
    ).toBe(
      "LEARN MORE\n  axm knowledge install @ac/knowledge/workspace-baseline\n    Install a Knowledge bundle",
    );
  });

  it("reads its rows back from either row form", () => {
    const rows = [
      ["axm help skills", "How skill extensions work"],
      ["axm knowledge install @ac/knowledge/workspace-baseline", "Install a Knowledge bundle"],
      ["axm help", "Browse all help topics"],
    ] as const;
    expect(learnMoreRows(formatLearnMore(rows))).toEqual({ title: "LEARN MORE", rows });
  });
});

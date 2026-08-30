import { describe, expect, it } from "vitest";
import {
  extractTomlQuotedStrings,
  parseTomlStringEntries,
  parseTomlValue,
  readTomlSection,
  stringifyToml,
} from "./index.js";

describe("toml utilities", () => {
  it("stringifies scalars, arrays, and nested tables", () => {
    expect(
      stringifyToml({
        name: "review",
        enabled: true,
        tools: ["Read", "Write"],
        config: { retries: 2 },
      }),
    ).toBe(
      [
        'name = "review"',
        "enabled = true",
        'tools = ["Read", "Write"]',
        "",
        "[config]",
        "retries = 2",
      ].join("\n"),
    );
  });

  it("reads a section body", () => {
    const content = [
      "[project]",
      'name = "demo"',
      "",
      "[dependencies]",
      'effect = "4.0.0"',
      "",
      "[dev-dependencies]",
      'vitest = "4.0.0"',
    ].join("\n");

    expect(readTomlSection(content, "dependencies")).toBe('\neffect = "4.0.0"');
  });

  it("parses quoted string entries", () => {
    expect(parseTomlStringEntries('effect = "4.0.0"\nvitest = "4.0.0"')).toEqual([
      { key: "effect", value: "4.0.0" },
      { key: "vitest", value: "4.0.0" },
    ]);
  });

  it("extracts quoted strings from array bodies", () => {
    expect(extractTomlQuotedStrings('"httpx>=1", "pytest==8.0.0"')).toEqual([
      "httpx>=1",
      "pytest==8.0.0",
    ]);
  });

  it("parses the AXM metadata value subset", () => {
    expect(parseTomlValue('[{ ref = "@owner/packs/example", versionRange = "^1.0.0" }]')).toEqual([
      { ref: "@owner/packs/example", versionRange: "^1.0.0" },
    ]);
    expect(parseTomlValue("true")).toBe(true);
  });
});

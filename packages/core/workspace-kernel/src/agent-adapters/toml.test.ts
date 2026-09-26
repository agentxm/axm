import { describe, expect, it } from "vitest";
import { parseTomlValue, stringifyToml } from "./toml.js";

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

  it("parses the AXM metadata value subset", () => {
    expect(parseTomlValue('[{ ref = "@owner/packs/example", versionRange = "^1.0.0" }]')).toEqual([
      { ref: "@owner/packs/example", versionRange: "^1.0.0" },
    ]);
    expect(parseTomlValue("true")).toBe(true);
  });
});

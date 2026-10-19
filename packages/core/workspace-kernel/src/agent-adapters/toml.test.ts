import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";
import { stringifyToml, stringifyTomlKey, stringifyTomlValue } from "./toml.js";

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

  it("keeps a multi-line value readable as a multi-line basic string", () => {
    expect(stringifyTomlValue("Line 1\nLine 2")).toBe('"""\nLine 1\nLine 2"""');
  });

  it.each([
    ["a backslash sequence after a line break", "Match\n\\d+ in C:\\work"],
    ["three quotes after a line break", 'a\n""" b'],
    ["quote runs up to the closing delimiter", 'a\n""""'],
    ["a leading line break", "\nindented"],
    ["carriage returns and control characters", "a\r\nb\u0000c\u007fd\te"],
    ["a one-line backslash and quote", 'say "\\n" literally'],
    ["one-line control characters", "tab\there\u0001\r"],
  ])("round-trips %s exactly", (_, value) => {
    expect(parse(`value = ${stringifyTomlValue(value)}`)).toEqual({ value });
  });

  it("round-trips a quoted key with escapes", () => {
    const key = 'odd "key"\\\n';
    expect(parse(`${stringifyTomlKey(key)} = 1`)).toEqual({ [key]: 1 });
  });
});

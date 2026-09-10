import { describe, expect, it } from "vitest";

import { resolveCliOutputPolicy, stripTerminalFormatting } from "./output-policy.js";

describe("stripTerminalFormatting", () => {
  it("removes ANSI styling and OSC hyperlinks", () => {
    expect(
      stripTerminalFormatting(
        "\u001b[2mdim\u001b[0m \u001b]8;;https://example.com\u001b\\link\u001b]8;;\u001b\\",
      ),
    ).toBe("dim link");
  });
});

describe("resolveCliOutputPolicy", () => {
  it("enables colors and interactive activity for a TTY without suppressing env", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: true, env: {} })).toEqual({
      colors: true,
      stdoutColors: true,
      stderrColors: true,
      animate: true,
      interactiveActivity: true,
      quiet: false,
      glyphs: "unicode",
    });
  });

  it("disables colors and interactive activity when stdout is not a TTY", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: false, env: {} })).toEqual({
      colors: false,
      stdoutColors: false,
      stderrColors: false,
      animate: false,
      interactiveActivity: false,
      quiet: false,
      glyphs: "unicode",
    });
  });

  it("disables colors and interactive activity when NO_COLOR is set", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: true, env: { NO_COLOR: "1" } })).toEqual({
      colors: false,
      stdoutColors: false,
      stderrColors: false,
      animate: false,
      interactiveActivity: false,
      quiet: false,
      glyphs: "unicode",
    });
  });

  it("disables colors and interactive activity when FORCE_COLOR is disabled", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: true, env: { FORCE_COLOR: "0" } })).toEqual({
      colors: false,
      stdoutColors: false,
      stderrColors: false,
      animate: false,
      interactiveActivity: false,
      quiet: false,
      glyphs: "unicode",
    });

    expect(resolveCliOutputPolicy({ stdoutIsTTY: true, env: { FORCE_COLOR: "" } })).toEqual({
      colors: false,
      stdoutColors: false,
      stderrColors: false,
      animate: false,
      interactiveActivity: false,
      quiet: false,
      glyphs: "unicode",
    });
  });

  it("disables colors and interactive activity in CI", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: true, env: { CI: "true" } })).toEqual({
      colors: false,
      stdoutColors: false,
      stderrColors: false,
      animate: false,
      interactiveActivity: false,
      quiet: false,
      glyphs: "unicode",
    });
  });

  it("disables colors and interactive activity for a dumb terminal", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: true, env: { TERM: "dumb" } })).toEqual({
      colors: false,
      stdoutColors: false,
      stderrColors: false,
      animate: false,
      interactiveActivity: false,
      quiet: false,
      glyphs: "ascii",
    });
  });

  it("records quiet output preference independently of color policy", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: true, env: {}, quiet: true })).toEqual({
      colors: true,
      stdoutColors: true,
      stderrColors: true,
      animate: true,
      interactiveActivity: true,
      quiet: true,
      glyphs: "unicode",
    });
  });

  it("keeps a pipe plain when FORCE_COLOR is requested", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: false, env: { FORCE_COLOR: "1" } })).toEqual({
      colors: false,
      stdoutColors: false,
      stderrColors: false,
      animate: false,
      interactiveActivity: false,
      quiet: false,
      glyphs: "unicode",
    });
  });

  it("styles each stream only when that stream is a TTY", () => {
    expect(
      resolveCliOutputPolicy({ stdoutIsTTY: false, stderrIsTTY: true, env: {} }),
    ).toMatchObject({ colors: true, stdoutColors: false, stderrColors: true });
    expect(
      resolveCliOutputPolicy({ stdoutIsTTY: true, stderrIsTTY: false, env: {} }),
    ).toMatchObject({ colors: true, stdoutColors: true, stderrColors: false });
    expect(
      resolveCliOutputPolicy({ stdoutIsTTY: false, stderrIsTTY: true, env: { FORCE_COLOR: "1" } }),
    ).toMatchObject({ stdoutColors: false, stderrColors: true, animate: true });
    expect(
      resolveCliOutputPolicy({ stdoutIsTTY: true, stderrIsTTY: false, env: { FORCE_COLOR: "1" } }),
    ).toMatchObject({ stdoutColors: true, stderrColors: false, animate: false });
  });

  it("keys live-frame animation to its stderr target", () => {
    expect(
      resolveCliOutputPolicy({ stdoutIsTTY: true, stderrIsTTY: false, env: {} }),
    ).toMatchObject({ colors: true, animate: false, interactiveActivity: false });
    expect(
      resolveCliOutputPolicy({ stdoutIsTTY: false, stderrIsTTY: true, env: {} }),
    ).toMatchObject({ colors: true, animate: true, interactiveActivity: true });
  });

  // Mixed-locale precedence remains an open question in the human-output specification.
  it("records the resolver's current selection for conflicting locale inputs", () => {
    expect(
      resolveCliOutputPolicy({ stdoutIsTTY: true, env: { LC_ALL: "C", LANG: "en_US.utf8" } })
        .glyphs,
    ).toBe("unicode");
  });
});

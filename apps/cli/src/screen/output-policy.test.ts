import { describe, expect, it } from "vitest";

import { resolveCliOutputPolicy } from "./output-policy.js";
import { stripTerminalFormatting } from "./width.js";

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
      stdoutColors: true,
      stderrColors: true,
      animate: true,
      quiet: false,
      glyphs: "unicode",
      taskbarProgress: false,
    });
  });

  it("disables colors and interactive activity when stdout is not a TTY", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: false, env: {} })).toEqual({
      stdoutColors: false,
      stderrColors: false,
      animate: false,
      quiet: false,
      glyphs: "unicode",
      taskbarProgress: false,
    });
  });

  it("disables colors and interactive activity when NO_COLOR is set", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: true, env: { NO_COLOR: "1" } })).toEqual({
      stdoutColors: false,
      stderrColors: false,
      animate: false,
      quiet: false,
      glyphs: "unicode",
      taskbarProgress: false,
    });
  });

  it("disables colors and interactive activity when FORCE_COLOR is disabled", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: true, env: { FORCE_COLOR: "0" } })).toEqual({
      stdoutColors: false,
      stderrColors: false,
      animate: false,
      quiet: false,
      glyphs: "unicode",
      taskbarProgress: false,
    });

    expect(resolveCliOutputPolicy({ stdoutIsTTY: true, env: { FORCE_COLOR: "" } })).toEqual({
      stdoutColors: false,
      stderrColors: false,
      animate: false,
      quiet: false,
      glyphs: "unicode",
      taskbarProgress: false,
    });
  });

  it("disables colors and interactive activity in CI", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: true, env: { CI: "true" } })).toEqual({
      stdoutColors: false,
      stderrColors: false,
      animate: false,
      quiet: false,
      glyphs: "unicode",
      taskbarProgress: false,
    });
  });

  it("disables colors and interactive activity for a dumb terminal", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: true, env: { TERM: "dumb" } })).toEqual({
      stdoutColors: false,
      stderrColors: false,
      animate: false,
      quiet: false,
      glyphs: "ascii",
      taskbarProgress: false,
    });
  });

  it("records quiet output preference independently of color policy", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: true, env: {}, quiet: true })).toEqual({
      stdoutColors: true,
      stderrColors: true,
      animate: true,
      quiet: true,
      glyphs: "unicode",
      taskbarProgress: false,
    });
  });

  it("keeps a pipe plain when FORCE_COLOR is requested", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: false, env: { FORCE_COLOR: "1" } })).toEqual({
      stdoutColors: false,
      stderrColors: false,
      animate: false,
      quiet: false,
      glyphs: "unicode",
      taskbarProgress: false,
    });
  });

  it("styles each stream only when that stream is a TTY", () => {
    expect(
      resolveCliOutputPolicy({ stdoutIsTTY: false, stderrIsTTY: true, env: {} }),
    ).toMatchObject({ stdoutColors: false, stderrColors: true });
    expect(
      resolveCliOutputPolicy({ stdoutIsTTY: true, stderrIsTTY: false, env: {} }),
    ).toMatchObject({ stdoutColors: true, stderrColors: false });
    expect(
      resolveCliOutputPolicy({ stdoutIsTTY: false, stderrIsTTY: true, env: { FORCE_COLOR: "1" } }),
    ).toMatchObject({ stdoutColors: false, stderrColors: true, animate: true });
    expect(
      resolveCliOutputPolicy({ stdoutIsTTY: true, stderrIsTTY: false, env: { FORCE_COLOR: "1" } }),
    ).toMatchObject({ stdoutColors: true, stderrColors: false, animate: false });
  });

  // Mixed-locale precedence remains an open question in the human-output specification.
  it("records the resolver's current selection for conflicting locale inputs", () => {
    expect(
      resolveCliOutputPolicy({ stdoutIsTTY: true, env: { LC_ALL: "C", LANG: "en_US.utf8" } })
        .glyphs,
    ).toBe("unicode");
  });
  it("shows taskbar progress only on terminals that draw it, never through a multiplexer", () => {
    const tty = { stdoutIsTTY: true, stderrIsTTY: true };
    expect(resolveCliOutputPolicy({ ...tty, env: { WT_SESSION: "1" } }).taskbarProgress).toBe(true);
    expect(
      resolveCliOutputPolicy({ ...tty, env: { TERM_PROGRAM: "ghostty" } }).taskbarProgress,
    ).toBe(true);
    expect(
      resolveCliOutputPolicy({ ...tty, env: { WT_SESSION: "1", TMUX: "/tmp/tmux" } })
        .taskbarProgress,
    ).toBe(false);
    expect(resolveCliOutputPolicy({ ...tty, env: {} }).taskbarProgress).toBe(false);
    expect(
      resolveCliOutputPolicy({ ...tty, env: { WT_SESSION: "1" }, quiet: true }).taskbarProgress,
    ).toBe(false);
    expect(
      resolveCliOutputPolicy({ ...tty, env: { WT_SESSION: "1", CI: "true" } }).taskbarProgress,
    ).toBe(false);
  });
});

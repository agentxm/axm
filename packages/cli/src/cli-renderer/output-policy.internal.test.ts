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
      animate: true,
      interactiveActivity: true,
      quiet: false,
    });
  });

  it("disables colors and interactive activity when stdout is not a TTY", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: false, env: {} })).toEqual({
      colors: false,
      animate: false,
      interactiveActivity: false,
      quiet: false,
    });
  });

  it("disables colors and interactive activity when NO_COLOR is set", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: true, env: { NO_COLOR: "1" } })).toEqual({
      colors: false,
      animate: false,
      interactiveActivity: false,
      quiet: false,
    });
  });

  it("disables colors and interactive activity when FORCE_COLOR is disabled", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: true, env: { FORCE_COLOR: "0" } })).toEqual({
      colors: false,
      animate: false,
      interactiveActivity: false,
      quiet: false,
    });

    expect(resolveCliOutputPolicy({ stdoutIsTTY: true, env: { FORCE_COLOR: "" } })).toEqual({
      colors: false,
      animate: false,
      interactiveActivity: false,
      quiet: false,
    });
  });

  it("disables colors and interactive activity in CI", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: true, env: { CI: "true" } })).toEqual({
      colors: false,
      animate: false,
      interactiveActivity: false,
      quiet: false,
    });
  });

  it("disables colors and interactive activity for a dumb terminal", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: true, env: { TERM: "dumb" } })).toEqual({
      colors: false,
      animate: false,
      interactiveActivity: false,
      quiet: false,
    });
  });

  it("records quiet output preference independently of color policy", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: true, env: {}, quiet: true })).toEqual({
      colors: true,
      animate: true,
      interactiveActivity: true,
      quiet: true,
    });
  });

  it("allows FORCE_COLOR on a pipe without enabling animation", () => {
    expect(resolveCliOutputPolicy({ stdoutIsTTY: false, env: { FORCE_COLOR: "1" } })).toEqual({
      colors: true,
      animate: false,
      interactiveActivity: false,
      quiet: false,
    });
  });
});

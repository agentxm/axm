import * as Option from "effect/Option";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveFormat, resolveFormatFromArgv } from "./resolve-format.js";

// ---------------------------------------------------------------------------
// TTY mock helpers
// ---------------------------------------------------------------------------

let originalStdoutIsTTY: PropertyDescriptor | undefined;
let originalStderrIsTTY: PropertyDescriptor | undefined;

const setTTY = (stdout: boolean, stderr: boolean): void => {
  Object.defineProperty(process.stdout, "isTTY", {
    value: stdout ? true : undefined,
    configurable: true,
  });
  Object.defineProperty(process.stderr, "isTTY", {
    value: stderr ? true : undefined,
    configurable: true,
  });
};

beforeEach(() => {
  originalStdoutIsTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  originalStderrIsTTY = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
});

afterEach(() => {
  if (originalStdoutIsTTY) {
    Object.defineProperty(process.stdout, "isTTY", originalStdoutIsTTY);
  } else {
    Object.defineProperty(process.stdout, "isTTY", { value: undefined, configurable: true });
  }
  if (originalStderrIsTTY) {
    Object.defineProperty(process.stderr, "isTTY", originalStderrIsTTY);
  } else {
    Object.defineProperty(process.stderr, "isTTY", { value: undefined, configurable: true });
  }
});

// ---------------------------------------------------------------------------
// resolveFormatFromArgv
// ---------------------------------------------------------------------------

describe("resolveFormatFromArgv", () => {
  it("returns explicit --output-format json regardless of TTY", () => {
    setTTY(true, true);
    expect(resolveFormatFromArgv(["--output-format", "json"])).toBe("json");
  });

  it("returns explicit --output-format text regardless of TTY", () => {
    setTTY(false, false);
    expect(resolveFormatFromArgv(["--output-format", "text"])).toBe("text");
  });

  it("returns explicit --output-format stream-json regardless of TTY", () => {
    setTTY(true, true);
    expect(resolveFormatFromArgv(["--output-format", "stream-json"])).toBe("stream-json");
  });

  it("returns text when stdout is a TTY", () => {
    setTTY(true, false);
    expect(resolveFormatFromArgv([])).toBe("text");
  });

  it("returns text when only stderr is a TTY (pnpm pipe scenario)", () => {
    setTTY(false, true);
    expect(resolveFormatFromArgv([])).toBe("text");
  });

  it("returns json when neither stdout nor stderr is a TTY", () => {
    setTTY(false, false);
    expect(resolveFormatFromArgv([])).toBe("json");
  });

  it("ignores --output-format without a following value", () => {
    setTTY(true, false);
    expect(resolveFormatFromArgv(["--output-format"])).toBe("text");
  });

  it("ignores --output-format with an invalid value", () => {
    setTTY(false, false);
    expect(resolveFormatFromArgv(["--output-format", "yaml"])).toBe("json");
  });
});

// ---------------------------------------------------------------------------
// resolveFormat
// ---------------------------------------------------------------------------

describe("resolveFormat", () => {
  it("returns explicit json regardless of TTY", () => {
    setTTY(true, true);
    expect(resolveFormat(Option.some("json"))).toBe("json");
  });

  it("returns explicit text regardless of TTY", () => {
    setTTY(false, false);
    expect(resolveFormat(Option.some("text"))).toBe("text");
  });

  it("returns explicit stream-json regardless of TTY", () => {
    setTTY(false, false);
    expect(resolveFormat(Option.some("stream-json"))).toBe("stream-json");
  });

  it("auto-detects text when stdout is a TTY", () => {
    setTTY(true, false);
    expect(resolveFormat(Option.none())).toBe("text");
  });

  it("auto-detects text when only stderr is a TTY (pnpm pipe scenario)", () => {
    setTTY(false, true);
    expect(resolveFormat(Option.none())).toBe("text");
  });

  it("auto-detects json when neither stdout nor stderr is a TTY", () => {
    setTTY(false, false);
    expect(resolveFormat(Option.none())).toBe("json");
  });

  it("auto-detects stream-json for long-running commands when not a TTY", () => {
    setTTY(false, false);
    expect(resolveFormat(Option.none(), { isLongRunning: true })).toBe("stream-json");
  });

  it("auto-detects text for long-running commands when stderr is a TTY", () => {
    setTTY(false, true);
    expect(resolveFormat(Option.none(), { isLongRunning: true })).toBe("text");
  });
});

import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import { resolveFormat, resolveFormatFromArgv } from "./resolve-format.js";

// ---------------------------------------------------------------------------
// resolveFormatFromArgv
// ---------------------------------------------------------------------------

describe("resolveFormatFromArgv", () => {
  it.each(["true", "yes", "on", "1", "y"])("recognizes true Boolean form %s", (value) => {
    expect(resolveFormatFromArgv([`--json=${value}`])).toBe("json");
    expect(resolveFormatFromArgv(["--json", value])).toBe("json");
    expect(resolveFormatFromArgv([`--plain=${value}`, "--json"])).toBe("text");
  });
  it.each(["false", "no", "off", "0", "n"])("recognizes false Boolean form %s", (value) => {
    expect(resolveFormatFromArgv([`--json=${value}`])).toBe("text");
    expect(resolveFormatFromArgv([`--plain=${value}`, "--json"])).toBe("json");
  });
  it("returns explicit --json", () => {
    expect(resolveFormatFromArgv(["--json"])).toBe("json");
  });

  it("returns explicit -j", () => {
    expect(resolveFormatFromArgv(["-j"])).toBe("json");
  });

  it("defaults to text without --json", () => {
    expect(resolveFormatFromArgv([])).toBe("text");
  });

  it("ignores other flags when resolving format", () => {
    expect(resolveFormatFromArgv(["--verbose"])).toBe("text");
  });

  it("keeps diagnostics off stdout when raw token output is requested with --json", () => {
    expect(resolveFormatFromArgv(["token", "show", "--plain", "--json"])).toBe("text");
    expect(resolveFormatFromArgv(["token", "show", "--plain", "-j"])).toBe("text");
  });

  it("does not reserve credential output for a diagnostic destination named token", () => {
    expect(resolveFormatFromArgv(["diagnostics", "export", "id", "token", "--json"])).toBe("json");
  });

  it("reads no options after --", () => {
    expect(resolveFormatFromArgv(["run", "--", "--json"])).toBe("text");
    expect(resolveFormatFromArgv(["run", "--json", "--", "--plain"])).toBe("json");
  });
});

// ---------------------------------------------------------------------------
// resolveFormat
// ---------------------------------------------------------------------------

describe("resolveFormat", () => {
  it("returns explicit json", () => {
    expect(resolveFormat(Option.some(true))).toBe("json");
  });

  it("treats explicit false as text", () => {
    expect(resolveFormat(Option.some(false))).toBe("text");
  });

  it("defaults to text when json is not requested", () => {
    expect(resolveFormat(Option.none())).toBe("text");
  });
});
